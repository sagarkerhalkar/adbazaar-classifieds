'use strict';
// Places for a worldwide site: countries (with their currency and phone code), states / regions, and the
// Indian cities the old ads use (so existing ads get their state filled in by themselves).

// [name, ISO code, currency, phone code]
const COUNTRIES = [
  ['India', 'IN', 'INR', '91'], ['United States', 'US', 'USD', '1'], ['United Kingdom', 'GB', 'GBP', '44'], ['United Arab Emirates', 'AE', 'AED', '971'],
  ['Canada', 'CA', 'CAD', '1'], ['Australia', 'AU', 'AUD', '61'], ['Singapore', 'SG', 'SGD', '65'], ['Saudi Arabia', 'SA', 'SAR', '966'],
  ['Qatar', 'QA', 'QAR', '974'], ['Kuwait', 'KW', 'KWD', '965'], ['Oman', 'OM', 'OMR', '968'], ['Bahrain', 'BH', 'BHD', '973'],
  ['Germany', 'DE', 'EUR', '49'], ['France', 'FR', 'EUR', '33'], ['Italy', 'IT', 'EUR', '39'], ['Spain', 'ES', 'EUR', '34'],
  ['Netherlands', 'NL', 'EUR', '31'], ['Belgium', 'BE', 'EUR', '32'], ['Ireland', 'IE', 'EUR', '353'], ['Portugal', 'PT', 'EUR', '351'],
  ['Austria', 'AT', 'EUR', '43'], ['Switzerland', 'CH', 'CHF', '41'], ['Sweden', 'SE', 'SEK', '46'], ['Norway', 'NO', 'NOK', '47'],
  ['Denmark', 'DK', 'DKK', '45'], ['Finland', 'FI', 'EUR', '358'], ['Poland', 'PL', 'PLN', '48'], ['Greece', 'GR', 'EUR', '30'],
  ['Turkey', 'TR', 'TRY', '90'], ['Russia', 'RU', 'RUB', '7'], ['Ukraine', 'UA', 'UAH', '380'], ['Israel', 'IL', 'ILS', '972'],
  ['Egypt', 'EG', 'EGP', '20'], ['South Africa', 'ZA', 'ZAR', '27'], ['Nigeria', 'NG', 'NGN', '234'], ['Kenya', 'KE', 'KES', '254'],
  ['Morocco', 'MA', 'MAD', '212'], ['Pakistan', 'PK', 'PKR', '92'], ['Bangladesh', 'BD', 'BDT', '880'], ['Sri Lanka', 'LK', 'LKR', '94'],
  ['Nepal', 'NP', 'NPR', '977'], ['Bhutan', 'BT', 'BTN', '975'], ['Maldives', 'MV', 'MVR', '960'], ['China', 'CN', 'CNY', '86'],
  ['Hong Kong', 'HK', 'HKD', '852'], ['Taiwan', 'TW', 'TWD', '886'], ['Japan', 'JP', 'JPY', '81'], ['South Korea', 'KR', 'KRW', '82'],
  ['Thailand', 'TH', 'THB', '66'], ['Malaysia', 'MY', 'MYR', '60'], ['Indonesia', 'ID', 'IDR', '62'], ['Philippines', 'PH', 'PHP', '63'],
  ['Vietnam', 'VN', 'VND', '84'], ['New Zealand', 'NZ', 'NZD', '64'], ['Mexico', 'MX', 'MXN', '52'], ['Brazil', 'BR', 'BRL', '55'],
  ['Argentina', 'AR', 'ARS', '54'], ['Chile', 'CL', 'CLP', '56'], ['Colombia', 'CO', 'COP', '57'], ['Peru', 'PE', 'PEN', '51'],
].map(([name, code, currency, dial]) => ({ name, code, currency, dial }));
const BY_NAME = new Map(COUNTRIES.map((c) => [c.name.toLowerCase(), c]));
const COUNTRY_ALIAS = { usa: 'United States', us: 'United States', america: 'United States', uk: 'United Kingdom', england: 'United Kingdom', britain: 'United Kingdom',
  uae: 'United Arab Emirates', emirates: 'United Arab Emirates', dubai: 'United Arab Emirates', ksa: 'Saudi Arabia', bharat: 'India', hindustan: 'India', holland: 'Netherlands', korea: 'South Korea' };
const CURRENCIES = [...new Set(COUNTRIES.map((c) => c.currency))];

/** Country by name or alias ("UK", "usa", "Bharat"), or null. */
function country(name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return null;
  return BY_NAME.get(k) || BY_NAME.get(String(COUNTRY_ALIAS[k] || '').toLowerCase()) || null;
}

// States and regions offered in the form (anything else can still be typed).
const REGIONS = {
  India: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry'],
  'United States': ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming', 'District of Columbia'],
  'United Kingdom': ['England', 'Scotland', 'Wales', 'Northern Ireland'],
  'United Arab Emirates': ['Abu Dhabi', 'Dubai', 'Sharjah', 'Ajman', 'Umm Al Quwain', 'Ras Al Khaimah', 'Fujairah'],
  Canada: ['Alberta', 'British Columbia', 'Manitoba', 'New Brunswick', 'Newfoundland and Labrador', 'Nova Scotia', 'Ontario', 'Prince Edward Island', 'Quebec', 'Saskatchewan'],
  Australia: ['New South Wales', 'Victoria', 'Queensland', 'Western Australia', 'South Australia', 'Tasmania', 'Australian Capital Territory', 'Northern Territory'],
};

// Indian cities → state (fills in the state of existing ads, and of new ads when the seller leaves it empty).
const IN_CITY_STATE = {
  mumbai: 'Maharashtra', pune: 'Maharashtra', nagpur: 'Maharashtra', nashik: 'Maharashtra', thane: 'Maharashtra', aurangabad: 'Maharashtra', 'navi mumbai': 'Maharashtra',
  kolhapur: 'Maharashtra', solapur: 'Maharashtra', amravati: 'Maharashtra', delhi: 'Delhi', 'new delhi': 'Delhi', bengaluru: 'Karnataka', bangalore: 'Karnataka',
  mysuru: 'Karnataka', mangaluru: 'Karnataka', hubli: 'Karnataka', hyderabad: 'Telangana', warangal: 'Telangana', chennai: 'Tamil Nadu', coimbatore: 'Tamil Nadu',
  madurai: 'Tamil Nadu', kolkata: 'West Bengal', howrah: 'West Bengal', ahmedabad: 'Gujarat', surat: 'Gujarat', vadodara: 'Gujarat', rajkot: 'Gujarat',
  jaipur: 'Rajasthan', jodhpur: 'Rajasthan', udaipur: 'Rajasthan', kota: 'Rajasthan', lucknow: 'Uttar Pradesh', kanpur: 'Uttar Pradesh', noida: 'Uttar Pradesh',
  ghaziabad: 'Uttar Pradesh', agra: 'Uttar Pradesh', varanasi: 'Uttar Pradesh', prayagraj: 'Uttar Pradesh', gurugram: 'Haryana', gurgaon: 'Haryana', faridabad: 'Haryana',
  chandigarh: 'Chandigarh', ludhiana: 'Punjab', amritsar: 'Punjab', bhopal: 'Madhya Pradesh', indore: 'Madhya Pradesh', gwalior: 'Madhya Pradesh', jabalpur: 'Madhya Pradesh',
  raipur: 'Chhattisgarh', patna: 'Bihar', ranchi: 'Jharkhand', bhubaneswar: 'Odisha', cuttack: 'Odisha', guwahati: 'Assam', kochi: 'Kerala', thiruvananthapuram: 'Kerala',
  kozhikode: 'Kerala', visakhapatnam: 'Andhra Pradesh', vijayawada: 'Andhra Pradesh', goa: 'Goa', panaji: 'Goa', dehradun: 'Uttarakhand', shimla: 'Himachal Pradesh',
  srinagar: 'Jammu and Kashmir', jammu: 'Jammu and Kashmir', puducherry: 'Puducherry',
};
const indianState = (city) => IN_CITY_STATE[String(city || '').trim().toLowerCase()] || '';

// Big cities abroad → [state / region, country] (fills in the state, and lets search read them as places).
const WORLD_CITY = {
  london: ['England', 'United Kingdom'], manchester: ['England', 'United Kingdom'], birmingham: ['England', 'United Kingdom'], leicester: ['England', 'United Kingdom'],
  edinburgh: ['Scotland', 'United Kingdom'], glasgow: ['Scotland', 'United Kingdom'], 'new york': ['New York', 'United States'], 'los angeles': ['California', 'United States'],
  'san francisco': ['California', 'United States'], 'san jose': ['California', 'United States'], chicago: ['Illinois', 'United States'], houston: ['Texas', 'United States'],
  dallas: ['Texas', 'United States'], seattle: ['Washington', 'United States'], boston: ['Massachusetts', 'United States'], 'new jersey': ['New Jersey', 'United States'],
  atlanta: ['Georgia', 'United States'], miami: ['Florida', 'United States'], toronto: ['Ontario', 'Canada'], vancouver: ['British Columbia', 'Canada'],
  montreal: ['Quebec', 'Canada'], calgary: ['Alberta', 'Canada'], sydney: ['New South Wales', 'Australia'], melbourne: ['Victoria', 'Australia'],
  brisbane: ['Queensland', 'Australia'], perth: ['Western Australia', 'Australia'], dubai: ['Dubai', 'United Arab Emirates'], 'abu dhabi': ['Abu Dhabi', 'United Arab Emirates'],
  sharjah: ['Sharjah', 'United Arab Emirates'], doha: ['', 'Qatar'], riyadh: ['', 'Saudi Arabia'], jeddah: ['', 'Saudi Arabia'], muscat: ['', 'Oman'],
  'kuwait city': ['', 'Kuwait'], manama: ['', 'Bahrain'], singapore: ['', 'Singapore'], 'kuala lumpur': ['', 'Malaysia'], bangkok: ['', 'Thailand'],
  'hong kong': ['', 'Hong Kong'], tokyo: ['', 'Japan'], paris: ['', 'France'], berlin: ['', 'Germany'], frankfurt: ['', 'Germany'], munich: ['', 'Germany'],
  amsterdam: ['', 'Netherlands'], dublin: ['', 'Ireland'], zurich: ['', 'Switzerland'], geneva: ['', 'Switzerland'], rome: ['', 'Italy'], milan: ['', 'Italy'],
  madrid: ['', 'Spain'], barcelona: ['', 'Spain'], lisbon: ['', 'Portugal'], stockholm: ['', 'Sweden'], kathmandu: ['', 'Nepal'], colombo: ['', 'Sri Lanka'],
  dhaka: ['', 'Bangladesh'], karachi: ['', 'Pakistan'], lahore: ['', 'Pakistan'], nairobi: ['', 'Kenya'], lagos: ['', 'Nigeria'], johannesburg: ['', 'South Africa'],
  'cape town': ['', 'South Africa'], cairo: ['', 'Egypt'], auckland: ['', 'New Zealand'],
};
/** A known city anywhere: { city, state, country } with proper names, or null. */
function knownCity(name) {
  const k = String(name || '').trim().toLowerCase();
  if (!k) return null;
  const title = k.replace(/\b\w/g, (x) => x.toUpperCase());
  if (IN_CITY_STATE[k]) return { city: title, state: IN_CITY_STATE[k], country: 'India' };
  if (WORLD_CITY[k]) return { city: title, state: WORLD_CITY[k][0], country: WORLD_CITY[k][1] };
  return null;
}

/** Every state / region name the form knows, lower-case → proper name (for the search box). */
const STATE_NAMES = new Map(Object.values(REGIONS).flat().map((s) => [s.toLowerCase(), s]));

/**
 * A phone number as international digits without "+" (e.g. "447700900123").
 * Indian 10-digit mobiles are kept as the 10 digits (as before). Returns '' if it does not look like a phone number.
 */
function phone(raw, countryName = 'India') {
  const s = String(raw || '').trim();
  let d = s.replace(/[^\d]/g, '');
  if (!d) return '';
  const c = country(countryName) || country('India');
  const plus = s.startsWith('+') || s.startsWith('00');
  if (s.startsWith('00')) d = d.slice(2);
  if (plus) {
    if (d.length === 12 && d.startsWith('91') && /^[6-9]/.test(d[2])) return d.slice(2);   // +91 mobile → 10 digits, as before
    return d.length >= 8 && d.length <= 15 ? d : '';
  }
  if (c.code === 'IN') {
    if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : '';
  }
  // a local number of another country: add its code (a leading 0 is the local trunk prefix)
  if (d.startsWith('0')) d = d.slice(1);
  const full = d.startsWith(c.dial) && d.length >= c.dial.length + 7 ? d : `${c.dial}${d}`;
  return full.length >= 8 && full.length <= 15 ? full : '';
}
/** Digits for tel: and wa.me links ("+" not included). Old 10-digit Indian numbers get 91 in front. */
const dialDigits = (p) => { const d = String(p || '').replace(/[^\d]/g, ''); return /^[6-9]\d{9}$/.test(d) ? `91${d}` : d; };
/** "+91 98765 43210" / "+44 7700900123" for showing. */
function phoneText(p) {
  const d = dialDigits(p);
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return d ? `+${d}` : '';
}

/** Price in the ad's own currency: ₹12,500 · $1,200 · €45 · AED 300. */
function money(paise, currency = 'INR') {
  const cur = CURRENCIES.includes(currency) ? currency : 'INR';
  const v = Math.round(Number(paise) || 0) / 100;
  if (cur === 'INR') return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  try { return new Intl.NumberFormat('en', { style: 'currency', currency: cur, currencyDisplay: 'narrowSymbol', maximumFractionDigits: v % 1 ? 2 : 0 }).format(v); } catch { return `${cur} ${v.toLocaleString('en')}`; }
}

module.exports = { COUNTRIES, CURRENCIES, REGIONS, STATE_NAMES, country, indianState, knownCity, phone, dialDigits, phoneText, money };
