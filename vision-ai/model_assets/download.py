"""Download pinned models and a small stratified RDD2022 validation/test sample."""
import hashlib
import json
from pathlib import Path
import random
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = json.loads(Path(__file__).with_name('manifest.json').read_text())


def fetch(url, target, sha256=None):
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists() or (sha256 and digest(target) != sha256):
        temporary = target.with_suffix(target.suffix + '.part')
        with urllib.request.urlopen(url, timeout=60) as response, temporary.open('wb') as output:
            shutil.copyfileobj(response, output)
        if sha256 and digest(temporary) != sha256:
            temporary.unlink()
            raise ValueError(f'Checksum mismatch: {target}')
        temporary.replace(target)
    return digest(target)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    for model in MANIFEST['models']:
        base = f"https://huggingface.co/{model['repository']}/resolve/{model['revision']}"
        target = ROOT / 'output/models' / model['name']
        fetch(f"{base}/{model['file']}", target / model['file'], model['sha256'])
        fetch(f'{base}/README.md', target / 'MODEL_CARD.md')
        print(f"Verified {model['name']}", flush=True)
    ds = MANIFEST['dataset']
    base = f"https://huggingface.co/datasets/{ds['repository']}/resolve/{ds['revision']}"
    out = ROOT / 'output/evaluation'
    fetch(f'{base}/README.md', out / 'DATASET_CARD.md')
    selected = []
    for split in ('valid', 'test'):
        rows = []
        for shard in ('shard_000', 'shard_001'):
            metadata = out / 'metadata' / split / f'{shard}.jsonl'
            fetch(f'{base}/data/images/{split}/{shard}/metadata.jsonl', metadata)
            rows.extend(dict(json.loads(line), shard=shard) for line in metadata.read_text().splitlines())
        countries = sorted({row['file_name'].rsplit('_', 1)[0] for row in rows})
        for country in countries:
            country_rows = [r for r in rows if r['file_name'].rsplit('_', 1)[0] == country]
            for group in ('pothole', 'clean', 'other_damage'):
                candidates = [r for r in country_rows if ('pothole' if 3 in r['objects']['categories'] else 'clean' if not r['objects']['categories'] else 'other_damage') == group]
                chosen = random.Random(f'vizor-rdd2022-20261014-{split}-{country}-{group}').sample(candidates, min(2, len(candidates)))
                for row in chosen:
                    name, shard = row['file_name'], row['shard']
                    url = f'{base}/data/images/{split}/{shard}/{name}'
                    image_sha = fetch(url, out / 'dataset/images' / split / name)
                    label = Path(name).with_suffix('.txt').name
                    label_url = f'{base}/data/labels/{split}/{shard}/{label}'
                    label_sha = fetch(label_url, out / 'dataset/labels' / split / label)
                    selected.append(dict(row, split=split, group=group, country=country, image_url=url, image_sha256=image_sha, label_sha256=label_sha))
        print(f'Downloaded {split} sample', flush=True)
    (out / 'subset.json').write_text(json.dumps({'dataset':ds,'selection':'Two randomly seeded images per available country/group/split; groups: pothole, no annotations, non-pothole damage. This is a diagnostic subset, not a benchmark.', 'samples':selected}, indent=2))
    (out / 'dataset/data.yaml').write_text(f'path: {out / "dataset"}\ntrain: images/valid\nval: images/valid\ntest: images/test\nnames: [longitudinal_crack, transverse_crack, alligator_crack, pothole]\n')
    for directory in (ROOT / 'output/models', out):
        for notice in ('NOTICE.md', 'AGPL-3.0.txt', 'CC-BY-SA-4.0.txt'):
            shutil.copyfile(Path(__file__).with_name(notice), directory / notice)


if __name__ == '__main__':
    main()
