// scripts/build-properties-json.js

const fs = require("fs");
const https = require("https");
const path = require("path");
const { parseStringPromise } = require("xml2js");

const FEED_URL = "https://s3-eu-west-1.amazonaws.com/feeds.agents-society.com/393-ai-feed-869909566.xml";

function fetchXML(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = "";
        res.on("data", chunk => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

async function run() {
  console.log("Fetching XML feed...");
  const xml = await fetchXML(FEED_URL);

  console.log("Parsing XML...");
  const parsed = await parseStringPromise(xml, { explicitArray: false });

  const rawProperties = parsed?.properties?.property || [];

  const properties = Array.isArray(rawProperties)
    ? rawProperties
    : [rawProperties];

  console.log(`Found ${properties.length} properties`);

  const toArray = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  const getAvailabilityIds = (property) => {
    const types = toArray(property.availabilities?.type);
    return types
      .map((t) => (typeof t === "string" ? t : t?.$?.id))
      .filter(Boolean);
  };

  const cleaned = properties
    .filter(p => {
      const status = String(p.status || "").trim().toLowerCase();
      return !status || status.includes("available");
    })
    .map(p => {
      const availabilityIds = getAvailabilityIds(p);
      const toLet = availabilityIds.includes("tolet");
      const forSale = availabilityIds.includes("forsale");

      return {
        id: Number(p.id),
        address: p.address1 || "",
        town: p.town || "",
        postcode: p.postcode || "",
        lat: Number(p.lat),
        lon: Number(p.lon),
        types: p.types?.type
          ? Array.isArray(p.types.type)
            ? p.types.type.map(t => t._ || t)
            : [p.types.type._ || p.types.type]
          : [],
        to_let: toLet,
        for_sale: forSale,
        size_from_sqft: Number(p.size_from_sqft) || null,
        size_to_sqft: Number(p.size_to_sqft) || null,
        summary: p.specification_summary?._ || "",
        images: p.images?.image
          ? Array.isArray(p.images.image)
            ? p.images.image
            : [p.images.image]
          : [],
        brochure_url: p.files?.file?.url || null,
        last_updated: p.last_updated
      };
    });

  const output = JSON.stringify(cleaned, null, 2);

  fs.writeFileSync(
    path.resolve(process.cwd(), "properties.json"),
    output
  );

  console.log("✅ properties.json generated");
}

run().catch(err => {
  console.error("❌ Error:", err);
  process.exit(1);
});
