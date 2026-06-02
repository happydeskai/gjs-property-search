// scripts/build-properties-json.js
// Build properties.json from the Kato XML feed with rich field mapping.

const fs = require("fs");
const https = require("https");
const path = require("path");
const { parseStringPromise } = require("xml2js");

const FEED_URL =
  "https://s3-eu-west-1.amazonaws.com/feeds.agents-society.com/393-ai-feed-869909566.xml";

// -------------- utils --------------
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

const txt = (v) =>
  v == null ? "" : typeof v === "string" ? v.trim() : (v._ ?? "").trim();

const num = (v) => {
  if (v == null) return NaN;
  const n = Number(String(v).replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

const extractImages = (node) => {
  const list = [];
  const imgs = arr(node?.image);
  for (const it of imgs) list.push(txt(it) || txt(it?.url));
  return [...new Set(list)].filter(Boolean);
};

// -------------- main --------------
async function run() {
  console.log("Fetching XML feed…");
  const xml = await fetchXML(FEED_URL);

  console.log("Parsing XML…");
  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    mergeAttrs: true,
  });

  const raw = parsed?.properties?.property ?? [];
  const props = Array.isArray(raw) ? raw : [raw];
  console.log(`Found ${props.length} properties in feed`);

  const out = props
    // Include ALL properties – unavailable ones (Under Offer, Let Agreed, Sold…)
    // are kept so they appear on the site with a clear status badge.
    .map((p, i) => {
      // availability + types
      const av = arr(p.availabilities?.type)
        .map((t) => (typeof t === "string" ? t : t._ ?? ""))
        .join(" ")
        .toLowerCase();

      const rawTypes = arr(p.types?.type)
        .map((t) => (typeof t === "string" ? t : t._ ?? ""))
        .filter(Boolean);

      // Map Kato types → 4 website categories
      const TYPE_MAP = {
        // Industrial
        "automotive": "Industrial",
        "business units": "Industrial",
        "data centre": "Industrial",
        "design and build": "Industrial",
        "distribution": "Industrial",
        "distribution warehouse": "Industrial",
        "factory": "Industrial",
        "gym": "Industrial",
        "industrial": "Industrial",
        "industrial (multi let scheme)": "Industrial",
        "industrial / manufacturing": "Industrial",
        "industrial / storage": "Industrial",
        "industrial / warehouse": "Industrial",
        "industrial land": "Industrial",
        "industrial park": "Industrial",
        "industrial/logistics": "Industrial",
        "light industrial": "Industrial",
        "logistics": "Industrial",
        "open storage": "Industrial",
        "trade": "Industrial",
        "trade counter": "Industrial",
        "trade counter / showroom": "Industrial",
        "urban logistics": "Industrial",
        "warehouse": "Industrial",
        "workshops": "Industrial",
        "yard": "Industrial",
        // Office
        "business park": "Office",
        "education": "Office",
        "f1 (learning and non-residential institutions)": "Office",
        "office": "Office",
        "serviced office": "Office",
        // Retail
        "a3 (restaurants and cafes)": "Retail",
        "bar": "Retail",
        "cafe (a1)": "Retail",
        "class e retail / leisure": "Retail",
        "high street retail": "Retail",
        "retail": "Retail",
        // Development / Investment
        "alternative use opportunity": "Development/Investment",
        "commercial development": "Development/Investment",
        "development": "Development/Investment",
        "development land": "Development/Investment",
        "development potential": "Development/Investment",
        "development site": "Development/Investment",
        "investment": "Development/Investment",
        "investment - industrial": "Development/Investment",
        "investment - mixed use": "Development/Investment",
        "investment - office": "Development/Investment",
        "investment - residential": "Development/Investment",
        "investment - retail & leisure": "Development/Investment",
        "investment - mixed use": "Development/Investment",
        "residential development": "Development/Investment",
        // Multi-category (E class covers industrial/office/retail)
        "e (commercial / business / service)": "Industrial",
        "mixed use": "Industrial",
        // Land → Development/Investment
        "land": "Development/Investment",
      };

      const types = [...new Set(
        rawTypes.map((t) => TYPE_MAP[t.toLowerCase()] || t)
      )].filter(Boolean);

      // features
      const features = arr(p.key_selling_points?.key_selling_point)
        .map(txt)
        .filter(Boolean);

      // EPC
      let epc_rating = "";
      const epcNode = p.current_energy_ratings?.rating;
      if (epcNode) {
        const rating = Array.isArray(epcNode) ? epcNode[0] : epcNode;
        const letter = txt(rating);
        const value = rating?.value;
        epc_rating = (letter || value)
          ? `${letter || ""}${value ? ` (${value})` : ""}`.trim()
          : "";
      }

      // contacts
      const contacts = arr(p.contacts?.contact)
        .map((c) => ({
          name:
            txt(c?.name) ||
            [txt(c?.forename), txt(c?.surname)].filter(Boolean).join(" "),
          email: txt(c?.email),
          phone: txt(c?.tel),
          mobile: txt(c?.mobile),
          company: txt(c?.office),
          branch: txt(c?.branch),
        }))
        .filter((c) => Object.values(c).some(Boolean));

      // sizes
      const size_from_sqft = num(
        p.size_from_sqft ?? p.size_from ?? p.total_property_size
      );
      const size_to_sqft = num(
        p.size_to_sqft ?? p.size_to ?? p.total_property_size
      );

      // rent & rates
      // The feed field rent_components.from is ambiguous — it contains the annual
      // total for "per annum" properties, but a genuine psf for "per sq ft" ones.
      // We normalise here so that:
      //   rent_psf  = always £ per sq ft (or undefined)
      //   rent_pa   = always £ per annum  (or undefined)
      const rentRaw = num(
        p.rent_components?.from ?? p.rent_components?.from_sqft
      );
      const rent = txt(p.rent); // formatted string e.g. "£18.50 per sq ft"
      const rentLC = rent.toLowerCase();
      const isPerSqFt  = rentLC.includes("per sq ft") || rentLC.includes("psf");
      const isPerAnnum = rentLC.includes("per annum") || rentLC.includes(" pa");

      let rent_psf, rent_pa;
      if (Number.isFinite(rentRaw) && rentRaw > 0) {
        if (isPerSqFt) {
          // feed value is already psf
          rent_psf = rentRaw;
          rent_pa  = Number.isFinite(size_from_sqft) && size_from_sqft > 0
            ? Math.round(rentRaw * size_from_sqft)
            : undefined;
        } else if (isPerAnnum) {
          // feed value is the annual total — derive psf from size
          rent_pa  = rentRaw;
          rent_psf = Number.isFinite(size_from_sqft) && size_from_sqft > 0
            ? Math.round((rentRaw / size_from_sqft) * 100) / 100
            : undefined;
        } else {
          // Unknown format (e.g. range "£x - £y") — store raw as rent_pa only
          rent_pa  = rentRaw;
          rent_psf = undefined;
        }
      }

      const business_rates_psf = num(p.business_rates?.rates_payable);
      const rateable_value = num(p.business_rates?.rateable_value);

      // Normalise status: capitalise first letter of each word
      const rawStatus = txt(p.status);
      const status = rawStatus
        ? rawStatus.replace(/\b\w/g, (c) => c.toUpperCase())
        : "Available";

      return {
        id: Number(p.id ?? p.object_id ?? i),
        status,
        address: txt(p.address1) || txt(p.name),
        town: txt(p.town),
        postcode: txt(p.postcode),
        lat: Number(p.lat),
        lon: Number(p.lon),

        types,
        raw_types: rawTypes, // original Kato types preserved for reference
        to_let: av.includes("to let"),
        for_sale: av.includes("for sale"),

        size_from_sqft: Number.isFinite(size_from_sqft) ? size_from_sqft : undefined,
        size_to_sqft: Number.isFinite(size_to_sqft) ? size_to_sqft : undefined,

        summary: txt(p.specification_summary) || undefined,
        description: txt(p.specification_description) || undefined,
        // NEW: rich location/transport fields
        location: txt(p.location) || undefined,
        marketing_text_transport: txt(p.marketing_text_transport) || undefined,

        features,

        rent_psf: rent_psf !== undefined ? rent_psf : undefined,
        rent_pa:  rent_pa  !== undefined ? rent_pa  : undefined,
        rent: rent || undefined,

        business_rates_psf: Number.isFinite(business_rates_psf)
          ? business_rates_psf
          : undefined,
        rateable_value: Number.isFinite(rateable_value) ? rateable_value : undefined,

        service_charge: txt(p.service_charge?.service_charge) || undefined,
        estate_charge: txt(p.estate_charge?.estate_charge) || undefined,

        epc_rating,

        images: extractImages(p.images),
        brochure_url: (() => {
  const files = arr(p.files?.file);
  const brochure = files.find(
    (f) => txt(f?.description).toLowerCase() === "brochure" || txt(f?.type) === "11"
  );
  return txt(brochure?.url) || undefined;
})(),

        contacts,
        last_updated: txt(p.last_updated) || txt(p.created_at) || undefined,
      };
    });

  fs.writeFileSync(
    path.resolve(process.cwd(), "properties.json"),
    JSON.stringify(out, null, 2)
  );
  console.log(`✅ properties.json generated (${out.length} items)`);
}

run().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
