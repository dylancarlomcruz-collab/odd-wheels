import type { ShipClass } from "./config";

export type InternationalCountryRate = {
  country: string;
  firstKg: number;
  every500g: number;
  weightLimitKg: number;
};

export type InternationalContainerType =
  | "SMALL_BOX"
  | "MEDIUM_BOX"
  | "MULTI_BOX";

const INTERNATIONAL_RATE_ROWS = `
Afghanistan|2112|506|30
Aland Island|2046|451|31.5
Albania|2003|588|20
Algeria|2112|520.5|20
Angola|2682|510.5|5
Anguilla|2600|937.5|20
Antigua and Barbuda|2520|866|20
Argentina|2332|727.5|20
Armenia|2314|704.5|20
Ascension|2352|664|20
Australia|1930|419.5|20
Austria|2106|438|31.5
Azerbaijan|1889|519.5|30
Bahamas|2374|805|20
Bahrain (Kingdom)|1752|324.5|30
Bangladesh|1791|336.5|20
Barbados|2785|901.5|20
Belarus|2470|757.5|20
Belgium|1917|403.5|30
Belize|2931|963.5|20
Benin|1817|649.5|30
Bermuda|2893|875|20
Bhutan|2068|333.5|30
Bolivia|3076|829|20
Bosnia and Herzegovina (JP BH Posta)|2232|723|31.5
Bosnia and Herzegovina (Mostar)|2232|723|31.5
Bosnia and Herzegovina (Poste Srpske)|2232|723|30
Botswana|2580|539|30
Brazil|2082|512.5|30
British Virgin Islands|2553|892.5|20
Brunei Darussalam|1465|268.5|30
Bulgaria (Republic)|2011|454.5|30
Burkina Faso|2101|580.5|30
Burundi|2111|465.5|30
Cambodia|1214|283.5|30
Cameroon|2102|516.5|20
Canada|2065|576|30
Cape Verde|2541|807|20
Cayman Islands|2870|954.5|10
Central African Republic|2832|834.5|30
Chad|2020|527|20
Chile|2396|760.5|20
China (People's Republic)|1741|325.5|30
Colombia|1884|557.5|50
Comoros|2281|737.5|20
Congo (Republic)|2722|944|20
Costa Rica|2576|835.5|30
Croatia|2185|466.5|30
Cuba|2330|712.5|20
Cyprus|1942|425|30
Czech Republic|2170|490.5|30
Democratic People's Republic of Korea|3048|943|20
Democratic Republic of the Congo|2073|522.5|20
Denmark|1997|437.5|20
Djibouti|2035|409.5|30
Dominica|2290|733.5|20
Dominican Republic|2232|838.5|20
Dutch Caribbean (Bonaire, Saba and Sint Eustatius)|2795|944.5|20
Ecuador|4064|703.5|20
Egypt|1801|400|50
El Salvador|3588|970.5|20
Equatorial Guinea|2396|838.5|50
Eritrea|2087|423|20
Estonia|2246|474|30
Ethiopia|1899|473|31.5
Faroe Islands|2182|510.5|20
Fiji|2322|839|20
Finland (including Aland Islands)|2046|451|31.5
France|1860|368.5|30
French Polynesia (including Clipperton Island)|2510|334.5|30
Gabon|2021|564|20
Gambia|1984|560.5|20
Georgia|2212|619.5|20
Germany|2096|383.5|31.5
Ghana|2214|574.5|30
Greece|1849|389|20
Greenland|2201|572.5|20
Grenada|2630|871|20
Guatemala|3524|515|20
Guinea|2593|837.5|20
Guinea-Bissau|2694|787.5|20
Guyana|2587|555.5|20
Haiti|2754|792.5|20
Honduras (Republic)|3033|541.5|20
Hong Kong, China|1275|237.5|30
Hungary|2151|485|20
Iceland|2307|521.5|20
India|1722|311|20
Indonesia|1222|260.5|30
Iran (Islamic Republic)|1802|338|20
Iraq|1920|687.5|20
Ireland|1914|371|30
Israel|2176|434|20
Italy|2000|378|30
Jamaica|2805|932.5|10
Japan|1785|326|30
Jordan|1845|316.5|31.5
Kazakhstan|2151|359.5|20
Kenya|2185|456|20
Kiribati|2616|844|20
Korea (Republic)|1919|247.5|20
Kuwait|1820|302.5|30
Kyrgyzstan|1879|561|20
Lao People's Democratic Republic|1235|307.5|30
Latvia|2285|482|30
Lebanon|1799|320|30
Lesotho|2335|713|30
Liberia|1949|735|20
Libya|1870|571.5|20
Liechtenstein|2222|694|30
Lithuania|2223|463|30
Luxembourg|2274|481.5|30
Macao, China|1070|201|31.5
Madagascar|2018|535|20
Malawi|2034|506|30
Malaysia|1236|266|30
Maldives|1761|309.5|30
Mali|1879|621.5|30
Malta|2145|505|30
Mauritania|1945|548.5|30
Mauritius|2086|510|30
Mexico|2200|764|30
Moldova|2108|486.5|20
Monaco|2756|874|20
Mongolia|2242|680|30
Montenegro|2297|492|30
Morocco|1941|380.5|30
Mozambique|2642|533.5|30
Myanmar|1318|340.5|20
Namibia|1948|559.5|30
Nauru|2536|1007.5|30
Nepal|1972|451|20
Netherlands|1987|374|23
New Caledonia|2272|537|20
New Zealand (including Ross Dependency)|2041|419|30
Nicaragua|2968|592|30
Niger|1935|551.5|20
Nigeria|1897|459.5|30
Niue|3919|914|20
Norway|2183|465.5|30
Oman|1844|317|30
Pakistan|1767|317|20
Palestine|2180|409|20
Panama (Republic)|3402|534.5|30
Papua New Guinea|2036|375.5|25
Paraguay|2315|584|30
Peru|2932|625|31.5
Poland|2251|491|20
Portugal|2745|542.5|30
Qatar|1843|308.5|20
Romania|2172|497|30
Russian Federation|2566|575|31
Rwanda|2108|470.5|30
Saint Christopher (St. Kitts) and Nevis|2652|870|20
Saint Lucia|2540|889|20
Saint Vincent and the Grenadines|2721|927.5|20
Samoa|2820|1134.5|30
American Samoa|4223|779.5|20
Sao Tome and Principe|2338|820|20
Saudi Arabia|1883|329.5|30
Senegal|1873|575.5|30
Serbia|2103|463.5|30
Seychelles|2756|905.5|30
Sierra Leone|1908|577|30
Singapore|735|211|30
Slovakia|2117|465.5|20
Slovenia|2305|461|30
Solomon Islands|2518|857|25
Somalia|2049|485|20
South Africa|2010|499.5|30
South Sudan|2171|444.5|20
Spain|2052|587.5|30
Sri Lanka|1824|347.5|30
St. Helena|2430|889.5|20
Sudan|2008|691.5|30
Suriname|2001|527.5|30
Swaziland|3903|930|20
Sweden|2080|451|20
Switzerland|1964|373|30
Taiwan|1236|266|20
Tajikistan|1893|627|20
Tanzania (United Republic)|2179|466.5|30
Thailand|1236|266|30
the former Yugoslav Republic of Macedonia|1972|486.5|20
Timor-Leste (Democratic Republic)|1769|510.5|20
Togo|2058|538|30
Tokelau|4393|720.5|20
Tonga (including Niuafo'ou)|2293|829.5|20
Trinidad and Tobago|2155|530.5|20
Tunisia|2141|572|30
Turkey|2178|542|30
Turkmenistan|1852|606.5|20
Turks and Caicos Islands|2164|749|20
Tuvalu|2577|846.5|30
Uganda|2121|461.5|30
Ukraine|2634|717|30
United Arab Emirates (UAE)|1804|308|30
United Kingdom of Great Britain and Northern Ireland|2061|414.5|50
United States of America|2021|597.5|31.5
Uruguay|2329|707.5|30
Uzbekistan|2419|520|20
Vanuatu|2611|1038|25
Vatican|2784|492|20
Venezuela (Bolivarian Republic)|2677|541.5|20
Viet Nam|1176|280.5|30
Wallis and Futuna Islands|2705|515|30
Zambia|2075|509|30
Zimbabwe|2034|534.5|30
`;

const INTERNATIONAL_SMALL_BOX_CAPACITY: Partial<Record<ShipClass, number>> = {
  MINI_GT: 30,
  SMALL_BOX_FIGURE: 30,
  KAIDO: 20,
  BBR: 20,
  POPRACE: 20,
  TARMAC_BOX: 20,
  ACRYLIC_TRUE_SCALE: 20,
  TARMAC_ACRYLIC: 20,
  BLISTER: 10,
  TOMICA: 30,
  TOMICA_LIMITED_VINTAGE_NEO: 30,
  HOT_WHEELS_MAINLINE: 10,
  HOT_WHEELS_PREMIUM: 10,
  LOOSE_NO_BOX: 30,
};

const COUNTRY_ALIASES: Record<string, string> = {
  "ALAND ISLANDS": "Aland Island",
  "BULGARIA (REP.)": "Bulgaria (Republic)",
  "CENTRAL AFRICAN REP.": "Central African Republic",
  "CENTRAL AFRICAN REPUBLIC": "Central African Republic",
  "CHINA (PEOPLE'S REP.)": "China (People's Republic)",
  "CHINA PEOPLES REPUBLIC": "China (People's Republic)",
  "CZECH REP.": "Czech Republic",
  CZECHIA: "Czech Republic",
  "DEM. PEOPLE'S REP. OF KOREA": "Democratic People's Republic of Korea",
  "DEMOCRATIC PEOPLES REPUBLIC OF KOREA":
    "Democratic People's Republic of Korea",
  "DEMOCRATIC PEOPLE'S REPUBLIC OF KOREA":
    "Democratic People's Republic of Korea",
  "DEN. PEOPLE'S REP. OF KOREA":
    "Democratic People's Republic of Korea",
  "DEM. REP. OF THE CONGO": "Democratic Republic of the Congo",
  "DEMOCRATIC REPUBLIC OF THE CONGO": "Democratic Republic of the Congo",
  "FRENCH POLYNESIA (INC. CLIPPERTON ISLAND)":
    "French Polynesia (including Clipperton Island)",
  "FINLAND (INC. ALAND ISLANDS)": "Finland (including Aland Islands)",
  "FINLAND INCLUDING ALAND ISLANDS": "Finland (including Aland Islands)",
  "HONDURAS (REP.)": "Honduras (Republic)",
  "IRAN (ISLAMIC REP.)": "Iran (Islamic Republic)",
  "KOREA (REP.)": "Korea (Republic)",
  "LAO PEOPLE'S DEM. REP.": "Lao People's Democratic Republic",
  "LAO PEOPLES DEMOCRATIC REPUBLIC": "Lao People's Democratic Republic",
  "NEW ZEALAND (INC ROSS DEPENDENCY)":
    "New Zealand (including Ross Dependency)",
  "PANAMA (REP.)": "Panama (Republic)",
  "TANZANIA (UNITED REP.)": "Tanzania (United Republic)",
  "TIMOR-LESTE (DEM. REP.)": "Timor-Leste (Democratic Republic)",
  "TONGA (INC. NIUAFO'OU)": "Tonga (including Niuafo'ou)",
  "TURKS AND CAICOS ISLANDS": "Turks and Caicos Islands",
  TURKMESTAN: "Turkmenistan",
  UAE: "United Arab Emirates (UAE)",
  UK: "United Kingdom of Great Britain and Northern Ireland",
  "UNITED KINGDOM": "United Kingdom of Great Britain and Northern Ireland",
  "UNITED STATES": "United States of America",
  USA: "United States of America",
  US: "United States of America",
  "VENEZUELA (BOLIVARIAN REP.)": "Venezuela (Bolivarian Republic)",
};

function normalizeCountryKey(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

function parseRateRows() {
  return INTERNATIONAL_RATE_ROWS.trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [country, firstKg, every500g, weightLimitKg] = line.split("|");
      return {
        country,
        firstKg: Number(firstKg),
        every500g: Number(every500g),
        weightLimitKg: Number(weightLimitKg),
      } satisfies InternationalCountryRate;
    });
}

export const INTERNATIONAL_AIR_PARCEL_RATES = parseRateRows();

export const INTERNATIONAL_COUNTRY_OPTIONS =
  INTERNATIONAL_AIR_PARCEL_RATES.map((rate) => rate.country);

const RATE_MAP = new Map(
  INTERNATIONAL_AIR_PARCEL_RATES.map((rate) => [
    normalizeCountryKey(rate.country),
    rate,
  ]),
);
const COUNTRY_ALIAS_MAP = new Map(
  Object.entries(COUNTRY_ALIASES).map(([key, value]) => [
    normalizeCountryKey(key),
    value,
  ]),
);

export function getInternationalCountryRate(
  rawCountry: string | null | undefined,
) {
  const normalized = normalizeCountryKey(rawCountry);
  if (!normalized) return null;
  const alias = COUNTRY_ALIAS_MAP.get(normalized);
  if (alias) {
    return RATE_MAP.get(normalizeCountryKey(alias)) ?? null;
  }
  return RATE_MAP.get(normalized) ?? null;
}

function roundToHalf(value: number) {
  return Math.ceil(value * 2) / 2;
}

function roundToCurrency(value: number) {
  return Number(value.toFixed(2));
}

function getSmallBoxCapacity(shipClass: ShipClass) {
  return INTERNATIONAL_SMALL_BOX_CAPACITY[shipClass] ?? null;
}

export function isInternationalShipClassSupported(shipClass: ShipClass) {
  return getSmallBoxCapacity(shipClass) !== null;
}

export type InternationalQuote =
  | {
      ok: true;
      country: string;
      rate: InternationalCountryRate;
      fee: number;
      volumetricWeightKg: number;
      billableWeightKg: number;
      additionalHalfKgSteps: number;
      boxUsage: number;
      boxType: InternationalContainerType;
      pack: InternationalContainerType;
    }
  | {
      ok: false;
      reason: string;
      unsupportedClasses?: ShipClass[];
    };

// Business rule from operations:
// - 1 full LBC small-box equivalent = 1kg volumetric weight
// - 1 medium-box equivalent = 2 small boxes = 2kg volumetric weight
// - capacities per small box come from the shop's own packing rules
export function quoteInternationalAirParcel(params: {
  country: string | null | undefined;
  counts: Partial<Record<ShipClass, number>>;
}): InternationalQuote {
  const rate = getInternationalCountryRate(params.country);
  if (!rate) {
    return {
      ok: false,
      reason: "Select a supported destination country for international shipping.",
    };
  }

  let boxUsage = 0;
  const unsupportedClasses: ShipClass[] = [];

  for (const shipClass of Object.keys(params.counts) as ShipClass[]) {
    const qty = Math.max(0, Number(params.counts[shipClass] ?? 0));
    if (qty <= 0) continue;
    const capacity = getSmallBoxCapacity(shipClass);
    if (!capacity) {
      unsupportedClasses.push(shipClass);
      continue;
    }
    boxUsage += qty / capacity;
  }

  if (unsupportedClasses.length) {
    return {
      ok: false,
      reason:
        "International shipping is not configured for one or more item classes in this cart.",
      unsupportedClasses,
    };
  }

  if (boxUsage <= 0) {
    return { ok: false, reason: "No shippable items found for international shipping." };
  }

  const volumetricWeightKg = roundToCurrency(boxUsage);
  const billableWeightKg = Math.max(1, roundToHalf(volumetricWeightKg));

  if (billableWeightKg > rate.weightLimitKg) {
    return {
      ok: false,
      reason: `${rate.country} has a ${rate.weightLimitKg}kg air-parcel limit.`,
    };
  }

  const additionalHalfKgSteps = Math.max(0, Math.round((billableWeightKg - 1) * 2));
  const fee = roundToCurrency(
    rate.firstKg + additionalHalfKgSteps * rate.every500g,
  );
  const boxType: InternationalContainerType =
    boxUsage <= 1 ? "SMALL_BOX" : boxUsage <= 2 ? "MEDIUM_BOX" : "MULTI_BOX";

  return {
    ok: true,
    country: rate.country,
    rate,
    fee,
    volumetricWeightKg,
    billableWeightKg,
    additionalHalfKgSteps,
    boxUsage: roundToCurrency(boxUsage),
    boxType,
    pack: boxType,
  };
}

export function formatInternationalContainerLabel(
  boxType: InternationalContainerType,
) {
  if (boxType === "SMALL_BOX") return "Small box";
  if (boxType === "MEDIUM_BOX") return "Medium box";
  return "Multiple boxes";
}
