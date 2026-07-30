import { describe, expect, it } from "vitest";
import { preserveScrollOffsets } from "./ForeignObjectRasterStrategy";

describe("preserveScrollOffsets", () => {
  it("serializes a scroll offset as a child transform", () => {
    const source = document.createElement("div");
    const content = document.createElement("div");
    content.style.transform = "scale(0.9)";
    source.appendChild(content);
    source.scrollLeft = 12;
    source.scrollTop = 48;

    const clone = source.cloneNode(true) as HTMLElement;
    preserveScrollOffsets(source, clone);

    expect((clone.firstElementChild as HTMLElement).style.transform).toBe(
      "translate(-12px, -48px) scale(0.9)",
    );
  });
});
