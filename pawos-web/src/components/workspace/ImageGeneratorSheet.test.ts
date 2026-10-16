import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { GeneratedImageFrame, ImageGeneratorSheet, chargedLine, priceLine, zoomOnEvent } from "./ImageGeneratorSheet";

/** The web image sheet: the price it shows comes from the server; the sheet itself decides nothing. */
describe("what an image costs, in words", () => {
  it("Paw Go: free images left, then purchased credits", () => {
    expect(priceLine({ funding: "free_then_credits", chargePc: 9.7, freeImagesLeft: 2 })).toBe("Free — 2 of 3 free images left.");
    expect(priceLine({ funding: "free_then_credits", chargePc: 9.7, freeImagesLeft: 0 })).toBe("Uses 9.7 PC of your purchased credits.");
  });

  it("paid plans and Enterprise", () => {
    expect(priceLine({ funding: "buckets", chargePc: 9.7, freeImagesLeft: null })).toBe("Uses 9.7 PC of your plan's usage.");
    expect(priceLine({ funding: "organization", chargePc: 9.7, freeImagesLeft: null })).toBe("Uses 1 unit of your organization's shared monthly usage.");
    expect(priceLine(null)).toBe("Checking the price…");
  });

  it("what a finished image cost", () => {
    const base = { id: "i", url: "/api/web/images/i", aspectRatio: "1:1" };
    expect(chargedLine({ ...base, funding: "free", chargedPc: 0 })).toBe("Free image — no usage charged.");
    expect(chargedLine({ ...base, funding: "bucket", chargedPc: 9.7 })).toBe("Used 9.7 PC.");
    expect(chargedLine({ ...base, funding: "organization", chargedPc: 0 })).toBe("Used 1 unit of your organization's shared usage.");
  });
});

describe("the sheet", () => {
  it("opens with the composer's text, the ratios, a price line and Generate", () => {
    const html = renderToStaticMarkup(React.createElement(ImageGeneratorSheet, { initialPrompt: "A red kite", onClose: () => {} }));
    expect(html).toContain("Generate an image");
    expect(html).toContain("A red kite");
    expect(html).toContain('<option value="21:9">21:9</option>');
    expect(html).toContain('data-testid="image-price"');
    expect(html).toContain("Checking the price…");
    expect(html).toContain("Standard (1K)");
  });
});

describe("the generated image", () => {
  const html = renderToStaticMarkup(React.createElement(GeneratedImageFrame, { src: "/api/web/images/abc", alt: "A red kite" }));

  it("opens at normal size, as a zoom toggle reachable by keyboard", () => {
    expect(html).toMatch(/<img[^>]*role="button"[^>]*tabindex="0"[^>]*aria-pressed="false"/);
    expect(html).toContain('title="Zoom in"');
    expect(html).toContain("w-full cursor-zoom-in");
  });

  it("has a download icon on the image's top-right corner that fetches the original", () => {
    expect(html).toMatch(/<div class="absolute right-2 top-2 flex gap-1"><a href="\/api\/web\/images\/abc\?download=1"[^>]*aria-label="Download image"/);
    // The buttons sit outside the scrolling frame, so zooming never scrolls them away.
    expect(html.indexOf('data-testid="image-download"')).toBeGreaterThan(html.indexOf('data-testid="image-frame"'));
    expect(html).toMatch(/<svg[^>]*stroke="currentColor"[^>]*aria-hidden="true"/);
  });

  it("offers no edit button: PawOS has no image editing to connect it to", () => {
    expect(html).not.toMatch(/edit/i);
  });
});

describe("zooming the generated image", () => {
  const event = (type: string, key?: string) => ({ type, key, preventDefault: vi.fn(), stopPropagation: vi.fn() });
  const flip = () => {
    let zoomed = false;
    const setZoomed = (update: (value: boolean) => boolean) => {
      zoomed = update(zoomed);
    };
    return { setZoomed, get zoomed() { return zoomed; } };
  };

  it("a click zooms in, the next click zooms out — and the click goes no further", () => {
    const state = flip();
    const click = event("click");
    zoomOnEvent(click, state.setZoomed);
    expect(state.zoomed).toBe(true);
    expect(click.preventDefault).toHaveBeenCalled();
    expect(click.stopPropagation).toHaveBeenCalled();
    zoomOnEvent(event("click"), state.setZoomed);
    expect(state.zoomed).toBe(false);
  });

  it("Enter and Space toggle it too; other keys are left alone", () => {
    const state = flip();
    zoomOnEvent(event("keydown", "Enter"), state.setZoomed);
    expect(state.zoomed).toBe(true);
    zoomOnEvent(event("keydown", " "), state.setZoomed);
    expect(state.zoomed).toBe(false);
    const tab = event("keydown", "Tab");
    zoomOnEvent(tab, state.setZoomed);
    expect(state.zoomed).toBe(false);
    expect(tab.preventDefault).not.toHaveBeenCalled();
  });
});
