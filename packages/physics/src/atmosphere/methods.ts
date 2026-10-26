import type { Method, Reference } from "../core/result.ts";

const ICAO_DOC_7488: Reference = {
  citation:
    "ICAO Doc 7488/3, Manual of the ICAO Standard Atmosphere (extended to 80 kilometres), 3rd ed., International Civil Aviation Organization, 1993.",
};

const ISO_2533: Reference = {
  citation: "ISO 2533:1975, Standard Atmosphere. International Organization for Standardization.",
};

const US_STANDARD_ATMOSPHERE_1976: Reference = {
  citation:
    "U.S. Standard Atmosphere, 1976. NOAA/NASA/USAF, NOAA-S/T 76-1562 (NASA-TM-X-74335), Washington D.C., 1976.",
  url: "https://ntrs.nasa.gov/citations/19770009539",
};

export const ISA_TROPOSPHERE: Method = {
  id: "isa-troposphere",
  name: "Standard atmosphere (ICAO/ISO/US 1976), lowest layer: constant lapse rate, hydrostatic, ideal gas",
  references: [ICAO_DOC_7488, ISO_2533, US_STANDARD_ATMOSPHERE_1976],
};

export const SUTHERLAND_VISCOSITY: Method = {
  id: "sutherland-viscosity",
  name: "Sutherland's law for the dynamic viscosity of air, with the constants of the standard atmosphere",
  references: [
    {
      citation:
        'Sutherland, W. (1893). "The viscosity of gases and molecular force". Philosophical Magazine, Series 5, 36(223), 507-531.',
    },
    ICAO_DOC_7488,
  ],
};

export const GEOPOTENTIAL_ALTITUDE: Method = {
  id: "geopotential-altitude",
  name: "Geopotential altitude from geometric altitude, H = r0 Z / (r0 + Z)",
  references: [US_STANDARD_ATMOSPHERE_1976, ICAO_DOC_7488],
};
