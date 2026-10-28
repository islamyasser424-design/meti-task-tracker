// Extracted from the existing form's detectStage / detectModalityAndPass rules.
// Unknown stages / queue exceptions remain manual rather than guessed.
export function parseTaskLink(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    return {};
  }
  if (u.origin !== "https://labeling.robot.car") return {};
  const segment = u.hash.match(/\/do\/([^/?&#]+)/i)?.[1] || "",
    s = segment.toUpperCase(),
    queue = u.hash.match(/\/queue\/([^/?&#]+)/i)?.[1] || "";
  const result = {
    task_id: u.hash.match(/\/id\/(\d+)/)?.[1] || "",
    queue_name: queue,
    pass: s ? (s.endsWith("QA") ? "QA" : "FP") : "",
  };
  if (s.includes("SELLIVANDAR")) {
    result.stage = "Lidar Stage";
    result.modality = "Lidar";
  } else if (s.includes("SELLMSL")) result.stage = "Image Stage";
  else if (s.includes("SELLRELABELING")) {
    result.stage = "Relabeling Stage";
    result.modality = "Relabeling";
  } else if (s.includes("SELLMAPPING")) {
    result.stage = "Sellmapping Stage";
    result.modality = "Lane Line";
  }
  const q = queue.toLowerCase();
  if (
    (s.startsWith("SELLMSL") &&
      q === "sc3_full_scene_highway_mapless_filtered_3d_lanes") ||
    (s.startsWith("SELLIVANDAR") &&
      q === "sc3_full_scene_highway_lanes_first_lidar_labeling") ||
    (s.startsWith("SELLRELABELING") &&
      q === "sc3_full_scene_highway_lidar_only_labeling")
  )
    result.modality = "Lane Line";
  if (
    s.startsWith("SELLRELABELING") &&
    q === "sc3_full_scene_highway_lanes_first_lidar_labeling"
  )
    result.modality = "Lidar";
  return result;
}
