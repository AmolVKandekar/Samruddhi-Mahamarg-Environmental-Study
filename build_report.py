"""Build a sourced environmental screening dashboard and GIS exports."""

import argparse
import csv
import json
import math
from collections import Counter
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
EARTH_RADIUS_KM = 6371.0088
TOPICS = ('Forest and habitat', 'Air quality', 'Wildlife movement', 'Soil and drainage')
EVIDENCE = ('Documented condition', 'Published monitoring', 'Proposed measurement')


def read_csv(path):
    with path.open(encoding='utf-8-sig', newline='') as source:
        return list(csv.DictReader(source))


def screening_polygon(lat, lon, radius):
    latitude, longitude, delta = math.radians(lat), math.radians(lon), radius / EARTH_RADIUS_KM
    ring = []
    for point in range(72):
        # Counterclockwise exterior ring, using a spherical forward-geodesic calculation.
        heading = -math.tau * point / 72
        target_lat = math.asin(math.sin(latitude) * math.cos(delta)
                               + math.cos(latitude) * math.sin(delta) * math.cos(heading))
        target_lon = longitude + math.atan2(math.sin(heading) * math.sin(delta) * math.cos(latitude),
                                              math.cos(delta) - math.sin(latitude) * math.sin(target_lat))
        ring.append([round(math.degrees(target_lon), 6), round(math.degrees(target_lat), 6)])
    return [*ring, ring[0]]


def build(output):
    observations = read_csv(ROOT / 'data/screening.csv')
    sources = {source['source_id']: source for source in read_csv(ROOT / 'data/sources.csv')}
    if not observations or len({row['id'] for row in observations}) != len(observations):
        raise ValueError('Provide observations with unique IDs')
    for source in sources.values():
        parsed = urlparse(source['url'])
        if parsed.scheme != 'https' or not parsed.netloc:
            raise ValueError('Reference links must be HTTPS URLs')

    references, areas = [], []
    for row in observations:
        lat, lon, radius = (float(row[key]) for key in ('lat', 'lon', 'radius_km'))
        if not (17 <= lat <= 22 and 72 <= lon <= 80 and 0 < radius <= 20):
            raise ValueError(f'Unexpected coordinate or radius for {row["id"]}')
        if row['topic'] not in TOPICS or row['evidence'] not in EVIDENCE:
            raise ValueError(f'Unexpected topic or evidence class for {row["id"]}')
        source_id = row['source_id']
        if source_id not in sources and (source_id or row['evidence'] != 'Proposed measurement'):
            raise ValueError(f'Missing source for {row["id"]}')
        properties = {**row, 'lat': lat, 'lon': lon, 'radius_km': radius, 'source': sources.get(source_id)}
        references.append({'type': 'Feature', 'properties': properties,
                           'geometry': {'type': 'Point', 'coordinates': [lon, lat]}})
        areas.append({'type': 'Feature', 'properties': {'id': row['id'], 'topic': row['topic'], 'radius_km': radius},
                      'geometry': {'type': 'Polygon', 'coordinates': [screening_polygon(lat, lon, radius)]}})

    output.mkdir(parents=True, exist_ok=True)
    points = {'type': 'FeatureCollection', 'features': references}
    buffers = {'type': 'FeatureCollection', 'features': areas}
    for name, collection in [('reference-sites.geojson', points), ('screening-buffers.geojson', buffers)]:
        (output / name).write_text(json.dumps(collection, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    totals = Counter((row['topic'], row['evidence']) for row in observations)
    with (output / 'evidence-summary.csv').open('w', encoding='utf-8-sig', newline='') as target:
        writer = csv.writer(target)
        writer.writerow(['topic', *EVIDENCE, 'total'])
        for topic in TOPICS:
            counts = [totals[topic, kind] for kind in EVIDENCE]
            writer.writerow([topic, *counts, sum(counts)])

    payload = json.dumps({'points': points, 'buffers': buffers, 'topics': TOPICS}, ensure_ascii=False)
    page = (ROOT / 'dashboard.html').read_text(encoding='utf-8').replace('__EVIDENCE_PAYLOAD__', payload.replace('<', '\\u003c'))
    (output / 'index.html').write_text(page, encoding='utf-8')
    for name in ('map.js', 'study.css'):
        (output / name).write_bytes((ROOT / name).read_bytes())
    print(f'Built {len(references)} screening records and {len(areas)} GIS buffers in {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'docs')
    build(parser.parse_args().output)
