// scripts/build-properties-json.js
// Node CJS version to match your repo; maps many more fields from the Kato XML.

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
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

// helper: get inner text whether xml2js produced a string or an object with "_"
const txt = (v) => (v == null ? "" : (typeof v === "string" ? v : (v._ ?? ""))).trim();
const num = (v) => {
  if (v == null) return NaN;
  const n = Number(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// images can be <image>string</image> or objects; normalize to array of strings
const extractImages = (node) => {
  const list = [];
  const imgs = arr(node?.image);
  for (const it of imgs) list.push(txt(it) || txt(it?.url));
  return [...new Set(list)].filter(Boolean);
};

async function run() {
  console.log("Fetching XML feed…");
  const xml = await fetchXML(FEED_URL);

  console.log("Parsing XML…");
  const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });

  const raw = parsed?.properties?.property ?? [];
  const props = Array.isArray(raw) ? raw : [raw];
  console.log(`Found ${props.length} properties in feed`);

  const out = props
    // keep only Available (or if status missing)
    .filter((p) => {
      const status = String(p.status || "").toLowerCase();
      return !status || status.includes("available");
    })
    .map((p, i) => {
      // availability
      const av = arr(p.availabilities?.type).map((t) => (typeof t === "string" ? t : (t._ ?? ""))).join(" ").toLowerCase();

      // property types
      const types = arr(p.types?.type).map((t) =>
        typeof t === "string" ? t : (t._ ?? "")
      ).filter(Boolean);

      // features
      const features = arr(p.key_selling_points?.key_selling_point).map(txt).filter(Boolean);

      // EPC
      let epc_rating = "";
      const epcNode = p.current_energy_ratings?.rating;
      if (epcNode) {
        const rating = Array.isArray(epcNode) ? epcNode[0] : epcNode;
        const letter = txt(rating);
        const value = rating?.value;
        epc_rating = (letter || value) ? `${letter || ""}${value ? ` (${value})` : ""}`.trim() : "";
      }

      // contacts
      const contacts = arr(p.contacts?.contact).map((c) => ({
        name: txt(c?.name) || [txt(c?.forename), txt(c?.surname)].filter(Boolean).join(" "),
        email: txt(c?.email),
        phone: txt(c?.tel),
        mobile: txt(c?.mobile),
        company: txt(c?.office)
      })).filter((c) => Object.values(c).some(Boolean));

      // size
      const size_from_sqft = num(p.size_from_sqft ?? p.size_from ?? p.total_property_size);
      const size_to_sqft   = num(p.size_to_sqft   ?? p.size_to   ?? p.total_property_size);

      // rent/rates
      const rent_psf = num(p.rent_components?.from ?? p.rent_components?.from_sqft);
      const rent = txt(p.rent); // keep the formatted string as fallback (e.g. "£7.50 per sq ft")

      const business_rates_psf = num(p.business_rates?.rates_payable);
      const rateable_value     = num(p.business_rates?.rateable_value);

      return {
        id: Number(p.id ?? p.object_id ?? i),
        address: txt(p.address1) || txt(p.name),
        town: txt(p.town),
        postcode: txt(p.postcode),
        lat: Number(p.lat),
        lon: Number(p.lon),

        types,
        to_let: av.includes("to let"),
        for_sale: av.includes("for sale"),

        size_from_sqft: Number.isFinite(size_from_sqft) ? size_from_sqft : undefined,
        size_to_sqft:   Number.isFinite(size_to_sqft)   ? size_to_sqft   : undefined,

        summary: txt(p.specification_summary) || undefined,
        description: txt(p.specification_description) || undefined,
        features,

        rent_psf: Number.isFinite(rent_psf) ? rent_psf : undefined,
        rent: rent || undefined,

        business_rates_psf: Number.isFinite(business_rates_psf) ? business_rates_psf : undefined,
        rateable_value:     Number.isFinite(rateable_value)     ? rateable_value     : undefined,

        service_charge: txt(p.service_charge?.service_charge) || undefined,
        estate_charge:  txt(p.estate_charge?.estate_charge)  || undefined,

        epc_rating,

        images: extractImages(p.images),
        brochure_url: txt(p.files?.file?.url) || undefined,

        contacts,
        last_updated: txt(p.last_updated) || txt(p.created_at) || undefined
      };
    });

  const output = JSON.stringify(out, null, 2);
  fs.writeFileSync(path.resolve(process.cwd(), "properties.json"), output);
  console.log(`✅ properties.json generated (${out.length} items)`);
}

run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
