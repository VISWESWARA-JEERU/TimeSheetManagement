import { useSearchParams } from "react-router-dom";

export function useEmbeddedMode() {
  const [searchParams] = useSearchParams();
  return searchParams.get("embedded") === "1";
}
