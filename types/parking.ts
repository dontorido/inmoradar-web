export type ParkingPerspective = "visitor" | "resident";
export type RegulatedParkingType = "SER" | "ORA" | "AREA" | "OTA" | "unknown" | string;
export type ParkingDensityLevel = "low" | "medium" | "high" | "very_high";
export type ParkingDifficultyLabel = "muy fácil" | "fácil" | "media" | "difícil" | "muy difícil";

export type ParkingDifficultySignals = {
  perspective: ParkingPerspective;
  regulated_zone: {
    detected: boolean;
    type: RegulatedParkingType;
    impact: number;
    source: "municipal_open_data" | "municipal_open_data_pending_geometry" | "osm" | "manual" | null;
  };
  street_parking_pressure: {
    parking_spaces_count: number;
    parking_lane_ways_count: number;
    private_access_parkings_count: number;
    paid_parkings_count: number;
    impact: number;
  };
  public_parking: {
    count: number;
    capacity_total: number | null;
    available_spaces: number | null;
    impact: number;
  };
  osm_parkings_500m: {
    count: number;
    capacity_total: number | null;
    impact: number;
  };
  public_parkings_500m: {
    count: number;
    capacity_total?: number | null;
    available_spaces: number | null;
    impact: number;
  };
  urban_density: {
    level: ParkingDensityLevel;
    amenities_count: number;
    demand_amenities_count: number;
    offices_count: number;
    schools_count: number;
    hospitals_count: number;
    markets_count: number;
    shops_count: number;
    impact: number;
  };
  urban_morphology: {
    pedestrian_streets_count: number;
    living_streets_count: number;
    main_roads_count: number;
    parking_lane_detected: boolean;
    impact: number;
  };
  restrictions: {
    zbe: boolean;
    resident_only: boolean;
    loading_zones_detected: boolean;
    impact: number;
  };
  time_pressure: {
    applied: boolean;
    impact: number;
    reason?: string | null;
  };
};

export type ParkingDifficultyResponse = {
  ok: true;
  score: number;
  label: ParkingDifficultyLabel;
  confidence_score: number;
  radius_m: number;
  perspective: ParkingPerspective;
  signals: ParkingDifficultySignals;
  explanation: string[];
  sources: Array<{
    name: string;
    url?: string;
    type: "osm" | "municipal_open_data" | "manual" | "mock";
  }>;
  disclaimer: string;
};
