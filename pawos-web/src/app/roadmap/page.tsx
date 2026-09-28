import { redirect } from "next/navigation";

/** The roadmap page was retired — old links land on the Changelog. */
export default function RoadmapPage() {
  redirect("/changelog");
}
