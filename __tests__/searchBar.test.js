const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { getByLabelText, getByRole } = require("@testing-library/dom");

const htmlPath = path.join(__dirname, "..", "index.html");

const createDom = (width) => {
  const html = fs.readFileSync(htmlPath, "utf-8");
  const dom = new JSDOM(html, { pretendToBeVisual: true });
  dom.window.innerWidth = width;
  dom.window.dispatchEvent(new dom.window.Event("resize"));
  return dom;
};

const getSearchForm = (dom) => {
  const document = dom.window.document;
  const form = document.querySelector("#searchForm");
  const searchBarStyle = dom.window.getComputedStyle(form);
  return { document, form, searchBarStyle };
};

const getStyleText = (dom) =>
  Array.from(dom.window.document.querySelectorAll("style"))
    .map((style) => style.textContent || "")
    .join("\n");

describe("Property search form layout", () => {
  it("renders labeled controls in order with grid layout on mobile", () => {
    const dom = createDom(480);
    const { document, form, searchBarStyle } = getSearchForm(dom);

    const location = getByLabelText(document, "Location");
    const tenure = getByLabelText(document, "Tenure");
    const type = getByLabelText(document, "Type");
    const minSize = getByLabelText(document, "Min size");
    const maxSize = getByLabelText(document, "Max size");
    const submit = getByRole(document, "button", { name: "Search" });

    expect(form).toContainElement(location);
    expect(form).toContainElement(tenure);
    expect(form).toContainElement(type);
    expect(form).toContainElement(minSize);
    expect(form).toContainElement(maxSize);
    expect(form).toContainElement(submit);

    expect(form).toHaveClass("searchBar");
    expect(searchBarStyle.display).toBe("grid");
    expect(searchBarStyle.gridTemplateColumns).toContain("1fr");

    const inputStyle = dom.window.getComputedStyle(location);
    expect(inputStyle.width).toBe("100%");
    expect(dom.window.getComputedStyle(tenure).width).toBe("100%");
    expect(dom.window.getComputedStyle(type).width).toBe("100%");
    expect(dom.window.getComputedStyle(minSize).width).toBe("100%");
    expect(dom.window.getComputedStyle(maxSize).width).toBe("100%");

    const field = document.querySelector(".field");
    expect(dom.window.getComputedStyle(field).position).toBe("static");
  });

  it("keeps submit button visible and grid-defined on tablet widths", () => {
    const dom = createDom(800);
    const { document, searchBarStyle } = getSearchForm(dom);
    const submit = getByRole(document, "button", { name: "Search" });

    expect(submit).toBeEnabled();
    expect(searchBarStyle.display).toBe("grid");
    expect(searchBarStyle.gridTemplateColumns).not.toBe("");
  });

  it("declares desktop grid areas for six columns", () => {
    const dom = createDom(1200);
    const styleText = getStyleText(dom);

    expect(styleText).toMatch(/#searchForm\s*\{/);
    expect(styleText).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(styleText).toMatch(/grid-template-columns:\s*repeat\(6/);
    expect(styleText).toMatch(/grid-template-areas:\s*"location tenure type min max submit"/);
  });

  it("declares stacked layout for mobile", () => {
    const dom = createDom(480);
    const styleText = getStyleText(dom);

    expect(styleText).toMatch(/grid-template-areas:\s*"location"\s*"tenure"\s*"type"\s*"min"\s*"max"\s*"submit"/);
  });
});
