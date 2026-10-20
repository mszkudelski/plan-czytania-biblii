// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import PlanReplacement from "./PlanReplacement";
import type { Group } from "./types";
const group: Group = { id: "g", name: "G", createdAt: "", startDate: "2026-10-19", frequency: { kind: "daily", days: [] },
  planDays: [], progress: {}, members: [ { id: "a", name: "A", color: "", isAdmin: true }, { id: "b", name: "B", color: "", isAdmin: false } ] };
it("offers replacement only to an administrator and blocks it during pending progress writes", () => {
  const render = (memberId: string, disabled = false) => renderToStaticMarkup(<PlanReplacement group={group}
    credentials={{ groupId: "g", memberId, token: "" }} disabled={disabled} onReplace={() => {}} />);
  expect(render("b")).toBe("");
  expect(render("a")).toContain("Podmień plan");
  expect(render("a", true)).toContain('disabled=""');
});

it("shows the chosen CSV in the styled upload control and resets it when cancelled", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) => {
    const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent === label);
    if (!found) throw new Error(`Missing button: ${label}`);
    return found;
  };
  try {
    await act(async () => root.render(<PlanReplacement group={group}
      credentials={{ groupId: "g", memberId: "a", token: "" }} disabled={false} onReplace={() => {}} />));
    await act(async () => button("Podmień plan").click());
    expect(container.textContent).toContain("Wybierz plik CSV");
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    expect(input.getAttribute("aria-label")).toBe("Nowy plan CSV");
    const file = new File(["tytuł,czytanie\nDzień 1,Rdz 1"], "wlasny-plan.csv", { type: "text/csv" });
    Object.defineProperty(file, "text", { value: async () => "tytuł,czytanie\nDzień 1,Rdz 1" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });
    await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(container.querySelector(".replacement-file-name")?.textContent).toBe("wlasny-plan.csv");
    expect(container.querySelector(".replacement-preview")?.textContent).toContain("wlasny-plan.csv · 1 dni");
    expect(button("Podmień plan dla całej grupy").disabled).toBe(false);
    await act(async () => button("Anuluj").click());
    expect(container.querySelector("form")).toBeNull();
    await act(async () => button("Podmień plan").click());
    expect(container.querySelector(".replacement-file-name")?.textContent).toBe("Wybierz plik CSV");
    expect(container.querySelector(".replacement-preview")).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
