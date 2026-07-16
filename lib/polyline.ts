export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

export function polylineToSvgPath(
  encoded: string,
  width: number,
  height: number,
  padding: number = 4
): string {
  const points = decodePolyline(encoded);
  if (points.length === 0) return "";

  const lats = points.map((p) => p[0]);
  const lngs = points.map((p) => p[1]);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const rangeX = maxLng - minLng || 1e-5;
  const rangeY = maxLat - minLat || 1e-5;

  const innerW = width - padding * 2;
  const innerH = height - padding * 2;

  const scale = Math.min(innerW / rangeX, innerH / rangeY);
  const offsetX = padding + (innerW - rangeX * scale) / 2;
  const offsetY = padding + (innerH - rangeY * scale) / 2;

  return points
    .map((p, i) => {
      const x = (p[1] - minLng) * scale + offsetX;
      const y = (maxLat - p[0]) * scale + offsetY;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
