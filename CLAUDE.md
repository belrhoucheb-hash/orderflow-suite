# Claude-Dev Agent Skills - OrderFlow

## Project Context
OrderFlow is een geavanceerd multi-tenant Transport Management System (TMS) dat draait op Supabase. Het systeem heeft complexe Row Level Security (RLS) policies voor tenant isolatie en bevat autonome AI-componenten voor order processing, planning en dispatch.

## Development Commands
```bash
# Development server
npm run dev

# Testing
npm test
npm run test:e2e

# Type checking & linting  
npm run typecheck
npm run lint

# Database operations
npx supabase db reset
npx supabase gen types typescript --local > src/integrations/supabase/types.ts
```

## Supabase Multi-Tenant Security

### Core Principe: Tenant Isolation
Elke database operatie MOET gefilterd worden op `tenant_id`. Dit is kritisch voor data security tussen verschillende transportbedrijven die het systeem gebruiken.

**CORRECT:**
```sql
SELECT * FROM orders 
WHERE tenant_id = (auth.jwt() ->> 'app_metadata' ->> 'tenant_id')::uuid
AND status = 'pending';
```

**INCORRECT (Security Risk):**
```sql  
SELECT * FROM orders WHERE status = 'pending'; -- Exposes cross-tenant data!
```

### RLS Policy Template
Gebruik dit template voor nieuwe tabellen:

```sql
-- Enable RLS
ALTER TABLE public.new_table ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policy
CREATE POLICY "tenant_isolation_new_table" ON public.new_table
  FOR ALL TO authenticated
  USING (tenant_id = (auth.jwt() ->> 'app_metadata' ->> 'tenant_id')::uuid)
  WITH CHECK (tenant_id = (auth.jwt() ->> 'app_metadata' ->> 'tenant_id')::uuid);
```

## Database Schema Patterns

### Required Columns for New Tables
```sql
CREATE TABLE public.new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- ... other columns
  
  CONSTRAINT new_table_tenant_check CHECK (tenant_id IS NOT NULL)
);

-- Required index for performance
CREATE INDEX idx_new_table_tenant ON public.new_table(tenant_id);
```

### Audit Trail Integration
Voor belangrijke tabellen, voeg audit triggers toe:
```sql
CREATE TRIGGER audit_new_table 
  AFTER INSERT OR UPDATE OR DELETE ON public.new_table
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
```

## TypeScript Integration Patterns

### Supabase Client Usage
```typescript
// Always filter by tenant_id in queries
const { data, error } = await supabase
  .from('orders')
  .select('*')
  .eq('tenant_id', user.app_metadata.tenant_id)
  .eq('status', 'pending');

// For RPC calls, pass tenant_id explicitly  
const { data } = await supabase.rpc('calculate_route_cost', {
  p_tenant_id: user.app_metadata.tenant_id,
  p_order_ids: orderIds
});
```

### Hook Patterns
```typescript
// Custom hooks should include tenant context
export function useOrders(filters?: OrderFilters) {
  const { tenantId } = useTenant();
  
  return useQuery({
    queryKey: ['orders', tenantId, filters],
    queryFn: () => orderService.getOrders(tenantId, filters),
    enabled: !!tenantId
  });
}
```

## AI System Integration

### Confidence Tracking
OrderFlow gebruikt AI confidence metrics voor autonome beslissingen:
```typescript
// Log AI decisions with confidence scores
await supabase.from('ai_decisions').insert({
  tenant_id: tenantId,
  decision_type: 'route_optimization',
  confidence_score: 0.87,
  input_data: inputPayload,
  output_data: optimizedRoute,
  model_version: 'v1.2.3'
});
```

### Event Pipeline
Gebruik het event systeem voor AI triggers:
```typescript
await supabase.from('pipeline_events').insert({
  tenant_id: tenantId,
  event_type: 'order.created',
  entity_id: orderId,
  priority: 'high',
  metadata: { triggers: ['ai_pricing', 'route_planning'] }
});
```

## Testing Guidelines

### RLS Testing
Test altijd tenant isolation:
```typescript
// Test helper voor multi-tenant scenarios
export async function createTestTenant(): Promise<string> {
  const { data } = await supabase
    .from('tenants')
    .insert({ name: 'Test Tenant' })
    .select()
    .single();
  
  return data.id;
}

// Verify data isolation in tests
test('orders are tenant-isolated', async () => {
  const tenant1 = await createTestTenant();
  const tenant2 = await createTestTenant();
  
  // Create orders for different tenants
  await createOrder({ tenant_id: tenant1 });
  await createOrder({ tenant_id: tenant2 });
  
  // Verify tenant1 user only sees tenant1 data
  const orders = await getOrdersForTenant(tenant1);
  expect(orders.every(o => o.tenant_id === tenant1)).toBe(true);
});
```

## Deployment Considerations

### Migration Safety
- Test migraties altijd eerst op staging
- Gebruik transacties voor complexe schema wijzigingen  
- Backup data voordat je RLS policies wijzigt
- Monitor prestaties na index toevoegingen

### Performance Monitoring
```sql
-- Check RLS policy performance
EXPLAIN ANALYZE SELECT * FROM orders 
WHERE tenant_id = 'some-tenant-id' AND status = 'pending';

-- Monitor tenant data distribution
SELECT tenant_id, COUNT(*) as order_count 
FROM orders 
GROUP BY tenant_id 
ORDER BY order_count DESC;
```

## Common Pitfalls

1. **Vergeten tenant_id filter** - Resulteert in cross-tenant data leaks
2. **SECURITY DEFINER zonder validatie** - Bypass van RLS policies  
3. **Hardcoded tenant IDs** - Breekt multi-tenant flexibiliteit
4. **Missing indexes op tenant_id** - Slechte query performance
5. **Inconsistente error handling** - Gebruikers zien verkeerde data

Volg deze patronen om veilig en effectief te ontwikkelen binnen het OrderFlow systeem.