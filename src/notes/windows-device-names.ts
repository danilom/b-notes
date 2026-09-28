/**
 * Names Windows keeps for devices, which no program of his can open as a file.
 *
 * Measured on Windows 10 through `cmd.exe`, which goes through the same path
 * handling as Resoph, Notepad and Explorer: `CON.txt`, `CON .txt`,
 * `CON. Pismo.txt`, `Aux.txt` and `nul.txt.txt` all reach the device and
 * never become a file, while ` CON.txt`, `CON_.txt`, `CON something.txt`,
 * `COM0.txt` and `CLOCK$.txt` are ordinary files. What Windows compares is the
 * name up to its first dot, without trailing spaces.
 *
 * Node gets past this — it writes through `\\?\` paths — so b-notes can make
 * such a file, read it back, and leave him a text nothing else can open.
 * The superscript digits are reserved too, by Microsoft's own list.
 */
const DEVICE = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)$/i;

/** The part of a name Windows compares with its devices. */
function deviceSpan(stem: string): string {
  return (stem.split('.', 1)[0] ?? stem).replace(/ +$/, '');
}

/** Whether a file named `stem` plus any extension would be a device, not a file. */
export function isWindowsDeviceName(stem: string): boolean {
  return DEVICE.test(deviceSpan(stem));
}

/**
 * `stem` with an underscore straight after the part Windows would take for a
 * device — `CON` becomes `CON_`, `nul.txt` becomes `nul_.txt` — and anything
 * else untouched.
 *
 * After, not before: the name is his title wherever Resoph shows it, and his
 * list is in title order, so the text stays where he filed it. A space would
 * not do: trailing ones are ignored, and leading ones are his ranking.
 */
export function clearOfWindowsDevices(stem: string): string {
  const span = deviceSpan(stem);
  return DEVICE.test(span) ? `${span}_${stem.slice(span.length)}` : stem;
}
