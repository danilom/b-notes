import type { PresetId } from './lektor-service.ts';

/**
 * What each kind of correction tells the AI, which he also reads on the screen. In Serbian
 * whatever the app's language, because the AI is being asked about a Serbian text.
 */
export const PRESET_PROMPTS: Readonly<Record<PresetId, string>> = {
  letters:
    'Ispravi slova kojima nedostaju kukice, slovne greške, zareze, razmake i prelome redova. Reči ne menjaj. Autor piše namerno baš ovako, čak i kad rečenica deluje neobično. Zadrži narečje kojim je tekst pisan.',
  grammar:
    'Ispravi slova, zareze i razmake, kao i gramatiku. Gde se rečenica teško razume ili zapinje, preuredi je tako da bude jasna, koristeći što više autorovih reči. Ono što je u redu ne diraj. Zadrži autorov glas i narečje kojim je tekst pisan.',
  wording:
    'Ispravi greške i gramatiku, pa uredi tekst kao dobar urednik: podeli predugačke rečenice, izbaci ponavljanja i suvišne reči, i nađi bolju reč tamo gde je ova mutna ili nezgrapna. Nemoj se ustručavati: promene treba da se vide u svakom pasusu. Ne dodaj ništa što autor nije rekao. Zadrži njegov glas i narečje kojim je tekst pisan.',
  // Deliberately too much: next to this one, the one above looks about right.
  rewrite:
    'Napiši ovaj tekst iznova, smelo, kao pisac koji ga prepričava svojim perom. Ne ustručavaj se da promeniš bilo koju rečenicu: njen red, ritam, slike i izbor reči, spajaj ih i deli, i slobodno idi dalje nego što je neophodno, jer će autor sam odabrati šta mu se sviđa. Radi jednako smelo kroz ceo tekst, do poslednjeg pasusa, a ne samo na početku. Sačuvaj autorove glavne misli, činjenice i imena, i narečje kojim je tekst pisan. Ne izmišljaj događaje. Dužina može da se promeni, ali ne mnogo.',
};

export const PRESET_ORDER: readonly PresetId[] = ['letters', 'grammar', 'wording', 'rewrite'];
