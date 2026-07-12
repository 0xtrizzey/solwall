// Dev entry: install the chrome shim wired to the REAL background handlers,
// then boot the actual popup app.

import { installChromeShim } from "./devShim";
import { handleMessage } from "../background/handlers";

installChromeShim((msg, sender) => handleMessage(msg as never, sender));

import("../popup/main");
