export interface RaceResultConfig {
  key: string;
  eventname: string;
  contests: Record<string, string>;
  splits: Array<{
    ID: number;
    Name: string;
    Label: string;
    SplitType: number;
    Contest: number;
  }>;
  EventOver: boolean;
  server?: string;
}

export interface Split {
  Name: string;
  Exists: boolean;
  TOD?: string;
  Gun?: string;
  Chip?: string;
  Sector?: string;
  Speed?: string;
  RO?: number;
  RG?: number;
  RA?: number;
  ROM?: number;
  RGM?: number;
  RAM?: number;
}

export interface ParticipantView {
  Data: {
    SplitsAndLegs: {
      Splits: Split[];
    };
  };
}

export async function fetchConfig(
  eventId: number,
  server = "my.raceresult.com"
): Promise<RaceResultConfig> {
  const res = await fetch(
    `https://${server}/${eventId}/results/config?lang=en`
  );
  if (!res.ok) throw new Error(`Failed to fetch config: ${res.status}`);
  const data = await res.json();
  // The config may redirect us to a different server
  if (data.server) {
    return { ...data, server: data.server };
  }
  return data;
}

export async function fetchParticipantSplits(
  eventId: number,
  pid: number,
  key: string,
  server = "my.raceresult.com"
): Promise<Split[]> {
  const res = await fetch(
    `https://${server}/${eventId}/details0/view?pid=${pid}&key=${key}`
  );
  if (!res.ok) throw new Error(`Failed to fetch participant: ${res.status}`);
  const data: ParticipantView = await res.json();
  return data.Data?.SplitsAndLegs?.Splits ?? [];
}
