import { createFileRoute } from "@tanstack/react-router";
import { SynthApp } from "@/components/synth/synth-app";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <SynthApp />;
}
