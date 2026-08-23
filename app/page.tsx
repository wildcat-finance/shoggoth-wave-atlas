import { WaveAtlas } from "./WaveAtlas";
import { loadWaves } from "./waves-source";

export default async function Home() {
  const { waves } = await loadWaves(undefined);
  return <WaveAtlas waves={waves} />;
}
