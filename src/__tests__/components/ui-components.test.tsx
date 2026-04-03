import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { Package, Truck, Search as SearchIcon } from "lucide-react";

// ─── Mocks ───────────────────────────────────────────────────
vi.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => children,
}));

// ═══════════════════════════════════════════════════════════════
// EmptyState
// ═══════════════════════════════════════════════════════════════
describe("EmptyState", () => {
  it("renders title and default icon", async () => {
    const { EmptyState } = await import("@/components/ui/EmptyState");
    render(<EmptyState title="Geen data" />);
    expect(screen.getByText("Geen data")).toBeInTheDocument();
  });

  it("renders description when provided", async () => {
    const { EmptyState } = await import("@/components/ui/EmptyState");
    render(<EmptyState title="Leeg" description="Er zijn nog geen items." />);
    expect(screen.getByText("Er zijn nog geen items.")).toBeInTheDocument();
  });

  it("renders action when provided", async () => {
    const { EmptyState } = await import("@/components/ui/EmptyState");
    render(<EmptyState title="Leeg" action={<button>Toevoegen</button>} />);
    expect(screen.getByText("Toevoegen")).toBeInTheDocument();
  });

  it("renders custom icon", async () => {
    const { EmptyState } = await import("@/components/ui/EmptyState");
    const { container } = render(<EmptyState title="Leeg" icon={Package} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("applies custom className", async () => {
    const { EmptyState } = await import("@/components/ui/EmptyState");
    const { container } = render(<EmptyState title="T" className="custom-class" />);
    expect(container.firstChild).toHaveClass("custom-class");
  });
});

// ═══════════════════════════════════════════════════════════════
// LoadingState
// ═══════════════════════════════════════════════════════════════
describe("LoadingState", () => {
  it("renders default message", async () => {
    const { LoadingState } = await import("@/components/ui/LoadingState");
    render(<LoadingState />);
    expect(screen.getByText("Laden...")).toBeInTheDocument();
  });

  it("renders custom message", async () => {
    const { LoadingState } = await import("@/components/ui/LoadingState");
    render(<LoadingState message="Even geduld" />);
    expect(screen.getByText("Even geduld")).toBeInTheDocument();
  });

  it("shows spinner", async () => {
    const { LoadingState } = await import("@/components/ui/LoadingState");
    const { container } = render(<LoadingState />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// PageHeader
// ═══════════════════════════════════════════════════════════════
describe("PageHeader", () => {
  it("renders title", async () => {
    const { PageHeader } = await import("@/components/ui/PageHeader");
    render(<PageHeader title="Dashboard" />);
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("renders subtitle", async () => {
    const { PageHeader } = await import("@/components/ui/PageHeader");
    render(<PageHeader title="Orders" subtitle="Overzicht van alle orders" />);
    expect(screen.getByText("Overzicht van alle orders")).toBeInTheDocument();
  });

  it("renders actions", async () => {
    const { PageHeader } = await import("@/components/ui/PageHeader");
    render(<PageHeader title="T" actions={<button>Nieuw</button>} />);
    expect(screen.getByText("Nieuw")).toBeInTheDocument();
  });

  it("does not render subtitle when not provided", async () => {
    const { PageHeader } = await import("@/components/ui/PageHeader");
    const { container } = render(<PageHeader title="T" />);
    const paragraphs = container.querySelectorAll("p");
    expect(paragraphs.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// SearchInput
// ═══════════════════════════════════════════════════════════════
describe("SearchInput", () => {
  it("renders with placeholder", async () => {
    const { SearchInput } = await import("@/components/ui/SearchInput");
    render(<SearchInput value="" onChange={vi.fn()} placeholder="Zoek klant..." />);
    expect(screen.getByPlaceholderText("Zoek klant...")).toBeInTheDocument();
  });

  it("uses default placeholder", async () => {
    const { SearchInput } = await import("@/components/ui/SearchInput");
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.getByPlaceholderText("Zoeken...")).toBeInTheDocument();
  });

  it("calls onChange on input", async () => {
    const onChange = vi.fn();
    const { SearchInput } = await import("@/components/ui/SearchInput");
    render(<SearchInput value="" onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText("Zoeken..."), { target: { value: "test" } });
    expect(onChange).toHaveBeenCalledWith("test");
  });

  it("shows clear button when value is non-empty", async () => {
    const onChange = vi.fn();
    const { SearchInput } = await import("@/components/ui/SearchInput");
    render(<SearchInput value="abc" onChange={onChange} />);
    const clearBtn = screen.getByRole("button");
    expect(clearBtn).toBeInTheDocument();
    fireEvent.click(clearBtn);
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("hides clear button when value is empty", async () => {
    const { SearchInput } = await import("@/components/ui/SearchInput");
    render(<SearchInput value="" onChange={vi.fn()} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// SortableHeader
// ═══════════════════════════════════════════════════════════════
describe("SortableHeader", () => {
  it("renders label", async () => {
    const { SortableHeader } = await import("@/components/ui/SortableHeader");
    render(<SortableHeader label="Naam" field="name" currentSort={null} onSort={vi.fn()} />);
    expect(screen.getByText("Naam")).toBeInTheDocument();
  });

  it("calls onSort with field", async () => {
    const onSort = vi.fn();
    const { SortableHeader } = await import("@/components/ui/SortableHeader");
    render(<SortableHeader label="Naam" field="name" currentSort={null} onSort={onSort} />);
    fireEvent.click(screen.getByText("Naam"));
    expect(onSort).toHaveBeenCalledWith("name");
  });

  it("shows ascending icon when active asc", async () => {
    const { SortableHeader } = await import("@/components/ui/SortableHeader");
    const { container } = render(
      <SortableHeader label="Naam" field="name" currentSort={{ field: "name", direction: "asc" }} onSort={vi.fn()} />,
    );
    // ArrowUp should be present
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("shows descending icon when active desc", async () => {
    const { SortableHeader } = await import("@/components/ui/SortableHeader");
    const { container } = render(
      <SortableHeader label="Naam" field="name" currentSort={{ field: "name", direction: "desc" }} onSort={vi.fn()} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("shows neutral icon when not active", async () => {
    const { SortableHeader } = await import("@/components/ui/SortableHeader");
    const { container } = render(
      <SortableHeader label="Naam" field="name" currentSort={{ field: "other", direction: "asc" }} onSort={vi.fn()} />,
    );
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════
// StatusBadge
// ═══════════════════════════════════════════════════════════════
describe("StatusBadge", () => {
  it("renders correct label for each status", async () => {
    const { StatusBadge } = await import("@/components/ui/StatusBadge");
    const labels: Record<string, string> = {
      DRAFT: "Nieuw",
      PENDING: "In behandeling",
      PLANNED: "Ingepland",
      IN_TRANSIT: "Onderweg",
      DELIVERED: "Afgeleverd",
      CANCELLED: "Geannuleerd",
    };
    for (const [status, label] of Object.entries(labels)) {
      const { unmount } = render(<StatusBadge status={status as any} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("renders custom label override", async () => {
    const { StatusBadge } = await import("@/components/ui/StatusBadge");
    render(<StatusBadge status="DRAFT" label="Custom" />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
    expect(screen.queryByText("Nieuw")).not.toBeInTheDocument();
  });

  it("hides dot when hideDot=true", async () => {
    const { StatusBadge } = await import("@/components/ui/StatusBadge");
    const { container } = render(<StatusBadge status="DRAFT" hideDot />);
    expect(container.querySelector(".badge-status__dot")).not.toBeInTheDocument();
  });

  it("shows dot by default", async () => {
    const { StatusBadge } = await import("@/components/ui/StatusBadge");
    const { container } = render(<StatusBadge status="DRAFT" />);
    expect(container.querySelector(".badge-status__dot")).toBeInTheDocument();
  });

  it("applies sm size class", async () => {
    const { StatusBadge } = await import("@/components/ui/StatusBadge");
    const { container } = render(<StatusBadge status="DRAFT" size="sm" />);
    expect(container.firstChild).toHaveClass("text-[11px]");
  });
});

// ═══════════════════════════════════════════════════════════════
// KPIStrip
// ═══════════════════════════════════════════════════════════════
describe("KPIStrip", () => {
  it("renders all KPI items", async () => {
    const { KPIStrip } = await import("@/components/ui/KPIStrip");
    const items = [
      { label: "Orders", value: 42, icon: Package },
      { label: "Voertuigen", value: 8, icon: Truck },
    ];
    render(<KPIStrip items={items} animate={false} />);
    expect(screen.getByText("Orders")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Voertuigen")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("renders trend indicators", async () => {
    const { KPIStrip } = await import("@/components/ui/KPIStrip");
    const items = [
      { label: "Revenue", value: "10k", icon: Package, trend: { value: "+12%", direction: "up" as const } },
    ];
    render(<KPIStrip items={items} animate={false} />);
    expect(screen.getByText("+12%")).toBeInTheDocument();
  });

  it("renders with custom columns", async () => {
    const { KPIStrip } = await import("@/components/ui/KPIStrip");
    const items = [
      { label: "A", value: 1, icon: Package },
      { label: "B", value: 2, icon: Package },
      { label: "C", value: 3, icon: Package },
    ];
    const { container } = render(<KPIStrip items={items} columns={3} animate={false} />);
    expect(container.firstChild).toHaveClass("lg:grid-cols-3");
  });
});
