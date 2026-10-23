// Short share URL: /<racer>-<event> (e.g. /phil-dublin-half) renders the v2 race page.
import RacePageV2Route from "../race/[slug]/v2/page";

export { generateMetadata } from "../race/[slug]/v2/page";

export const dynamic = "force-dynamic";

export default RacePageV2Route;
