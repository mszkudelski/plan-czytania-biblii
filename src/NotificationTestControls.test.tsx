import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotificationTestControls from "./NotificationTestControls";

const props = { busy: false, testSent: true, onTest: () => undefined };
describe("notification test controls", () => {
  it("renders neither test actions nor troubleshooting on production, even with a stale preview configuration", () => {
    for (const scheduled of [true, false, undefined]) {
      expect(renderToStaticMarkup(<NotificationTestControls {...props} scheduled={scheduled} deployContext="production" />)).toBe("");
    }
  });
  it("does not expose tests before configuration loads or when daily scheduling is enabled", () => {
    for (const scheduled of [true, undefined]) {
      expect(renderToStaticMarkup(<NotificationTestControls {...props} scheduled={scheduled} deployContext="branch-deploy" />)).toBe("");
    }
  });
  it("keeps preview test tools collapsed until requested", () => {
    const html = renderToStaticMarkup(<NotificationTestControls {...props} scheduled={false} deployContext="branch-deploy" />);
    expect(html).toContain("<summary>Narzędzia testowe</summary>");
    expect(html).toContain("Wyślij powiadomienie testowe");
    expect(html).not.toContain(" open=");
  });
});
