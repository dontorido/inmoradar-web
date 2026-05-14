export type RegulatedParkingType = "SER" | "ORA" | "AREA" | "OTA" | "unknown";
export type ParkingDensityLevel = "low" | "medium" | "high" | "very_high";

export type ParkingDifficultySignals = {
  regulated_zone: {
    detected: boolean;
    type: RegulatedParkingType;
    impact: number;
    source: "municipal_open_data" | "osm" | "manual" | null;
  };
  osm_parkings_500m: {
    count: number;
    capacity_total: number | null;
    impact: number;
  };
  public_parkings_500m: {
    count: number;
    available_spaces: number | null;
    impact: number;
  };
  urban_density: {
    level: ParkingDensityLevel;
    impact: number;
  };
  urban_morphology: {
    pedestrian_streets_count: number;
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
  time_pressure?: {
    applied: boolean;
    impact: number;
  };
};

export type ParkingDifficultyResponse = {
  ok: true;
  score: number;
  label: "muy fácil" | "fácil" | "media" | "difícil" | "muy difícil";
  confidence_score: number;
  radius_m: number;
  signals: ParkingDifficultySignals;
  explanation: string[];
  sources: Array<{
    name: string;
    url?: string;
    type: "osm" | "municipal_open_data" | "manual" | "mock";
  }>;
};
