import { cleanup, render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { MemoryRouter } from "react-router-dom";

import NotFound from "@/pages/NotFound";

function renderNotFound() {
  return render(
    <MemoryRouter initialEntries={["/unknown-page"]}>
      <NotFound />
    </MemoryRouter>
  );
}

describe("NotFound", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => cleanup());

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
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderNotFound();
    expect(consoleSpy).toHaveBeenCalledWith(
      "404 Error: User attempted to access non-existent route:",
      expect.any(String)
    );
    consoleSpy.mockRestore();
  });
});
