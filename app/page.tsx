import { buildRevision } from "./build-info";
import { WaveAtlas } from "./WaveAtlas";
import { loadWaves } from "./waves-source";

export default async function Home() {
  const loaded = await loadWaves();
  return (
    <WaveAtlas
      waves={loaded.waves}
      provenance={{
        source: loaded.source,
        generatedAt: loaded.generatedAt,
        sourceRevision: loaded.sourceRevision,
        buildRevision,
        readError: loaded.readError,
      }}
    />
  );
}
