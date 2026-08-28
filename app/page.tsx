import { buildRevision } from "./build-info";
import { WaveAtlas } from "./WaveAtlas";
import { loadAtlasIssues, loadWaves } from "./waves-source";

export default async function Home() {
  const [loaded, maintenance] = await Promise.all([
    loadWaves(),
    loadAtlasIssues(),
  ]);
  return (
    <WaveAtlas
      waves={loaded.waves}
      atlasIssues={maintenance.issues}
      provenance={{
        source: loaded.source,
        generatedAt: loaded.generatedAt,
        sourceRevision: loaded.sourceRevision,
        buildRevision,
        readError: loaded.readError,
      }}
      maintenanceProvenance={{
        source: maintenance.source,
        generatedAt: maintenance.generatedAt,
        readError: maintenance.readError,
      }}
    />
  );
}
