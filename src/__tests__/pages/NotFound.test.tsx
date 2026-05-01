import { cleanup, render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import NotFound from "@/pages/NotFound";

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

function renderNotFound() {
  return render(
    <MemoryRouter initialEntries={["/unknown-page"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <NotFound />
    </MemoryRouter>
  );
}

describe("NotFound", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it("renders without crashing", () => {
    renderNotFound();
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("shows descriptive message", () => {
    renderNotFound();
    expect(screen.getByText(/Page not found/i)).toBeInTheDocument();
  });

  it("has a link to return home", () => {
    renderNotFound();
    const link = screen.getByText(/Return to Home/i);
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", "/");
  });

  it("logs 404 error to console", () => {
    renderNotFound();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "404 Error: User attempted to access non-existent route:",
      expect.any(String)
    );
  });
});
