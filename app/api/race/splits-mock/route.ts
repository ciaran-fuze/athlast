import { NextResponse } from "next/server";

// Mock splits simulating an athlete mid-race at 10K
export async function GET() {
  return NextResponse.json({
    splits: [
      {
        Name: "Startline",
        Exists: true,
        TOD: "08:30:04",
        Gun: "00:00",
        Chip: "00:04",
        RO: 4832,
        RG: 2201,
        RA: 412,
        ROM: 13200,
        RGM: 6800,
        RAM: 1100,
      },
      {
        Name: "5K",
        Exists: true,
        TOD: "08:54:36",
        Gun: "24:36",
        Chip: "24:32",
        Sector: "24:28",
        Speed: "4:53 min/km",
        RO: 3912,
        RG: 1804,
        RA: 338,
        ROM: 13100,
        RGM: 6750,
        RAM: 1090,
      },
      {
        Name: "10K",
        Exists: true,
        TOD: "09:18:48",
        Gun: "48:48",
        Chip: "48:44",
        Sector: "24:12",
        Speed: "4:50 min/km",
        RO: 3640,
        RG: 1690,
        RA: 310,
        ROM: 12900,
        RGM: 6700,
        RAM: 1080,
      },
      {
        Name: "15K",
        Exists: false,
      },
      {
        Name: "Finishline",
        Exists: false,
      },
    ],
  });
}
