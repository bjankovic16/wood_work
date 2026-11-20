import type { HandleStyle } from '../domain/style';
import type { Wall } from '../domain/types';
import { formatMm } from '../engine/format';
import type { EngineLabels } from '../engine/labels';
import { DEFAULT_EDGE_BANDS, DEFAULT_MATERIALS, MODULE_MATERIALS } from '../engine/settings';

/** Sizes with a decimal comma, as written in Serbian. */
export const srMm = (value: number) => formatMm(value).replace('.', ',');

/** "na gornjem zidu" and so on: the wall after "na" (locative). */
const naZidu: Record<Wall, string> = { top: 'na gornjem zidu', right: 'na desnom zidu', bottom: 'na donjem zidu', left: 'na levom zidu' };

const HANDLES: Record<HandleStyle, string> = { steel: 'čelična', black: 'crna', brass: 'mesingana', none: 'bez ručke', bronze: 'bronzana', copper: 'bakarna' };
const APPLIANCES = { oven: 'Ugradna rerna', fridge: 'Frižider', hob: 'Ploča za kuvanje', hood: 'Aspirator', dishwasher: 'Mašina za sudove' };

/** The built-in boards and edge bands, named in Serbian for as long as they keep their original names. */
const BOARDS: Record<string, string> = {
  'particleboard-white-18': 'Bela oplemenjena iverica',
  'particleboard-white-16': 'Bela oplemenjena iverica',
  'particleboard-oak-18': 'Oplemenjena iverica, dekor hrast',
  'hdf-white-3': 'Beli lesonit (HDF)',
  'mdf-18': 'MDF za farbanje',
  'mdf-oak-19': 'MDF furniran hrastom',
  'glass-clear-4': 'Providno staklo za vitrinu',
  'worktop-38': 'Radna ploča (izabrati završnu obradu)',
};
const BANDS: Record<string, string> = {
  'abs-1': 'ABS kant traka 1 mm',
  'abs-2': 'ABS kant traka 2 mm',
  'pvc-04': 'PVC kant traka 0,4 mm',
};
const originalBoardNames = new Map([...DEFAULT_MATERIALS, ...MODULE_MATERIALS].map((m) => [m.id, m.name]));
const originalBandNames = new Map(DEFAULT_EDGE_BANDS.map((b) => [b.id, b.name]));

export const SR_LABELS: EngineLabels = {
  roomFeatures: { chimney: 'Dimnjak', column: 'Stub', projection: 'Ispust zida' },
  roomPartition: 'Pregradni zid',
  roomTreatment: 'Zidna obloga',
  locale: 'sr-Latn',
  part: {
    side: 'Bok',
    bottom: 'Dno',
    top: 'Gornja ploča',
    frontRail: 'Prednja traverza',
    backRail: 'Zadnja traverza',
    back: 'Leđa',
    shelf: 'Polica',
    ovenShelf: 'Polica za rernu',
    fixedShelf: 'Fiksna polica',
    drawerBottom: 'Dno fioke',
    drawerBack: 'Zadnja stranica fioke',
    drawerSide: 'Stranica fioke',
    drawerFrontBack: 'Prednja/zadnja stranica fioke',
    door: 'Vrata',
    drawerFront: 'Čelo fioke',
    ovenPanel: 'Maska ispod rerne',
    dishwasherFront: 'Front mašine za sudove',
    fillerPanel: 'Filer',
    panel: 'Maska',
    endPanel: 'Bočna ploča',
    glassDoor: 'Staklena vrata, pripremna mera',
    pullOutFront: 'Front izvlačne korpe',
    barTop: 'Barska ploča',
  },
  note: (note) => {
    switch (note.kind) {
      case 'grooved':
        return 'U nutu';
      case 'metalDrawer':
        return `Metalni sistem fioke, ${note.slide} mm`;
      case 'woodenDrawer':
        return `Sanduk fioke, klizači ${note.slide} mm`;
      case 'lShaped':
        return `L-oblik: iseći ${srMm(note.a)} × ${srMm(note.b)} u unutrašnjem uglu`;
      case 'cornerBack':
        return `Ugaoni element, zid ${note.wall}`;
      case 'cornerDoor':
        return `Ugaona vrata, zid ${note.wall}`;
      case 'glassBlank':
        return 'Staklorezac potvrđuje sigurnosno staklo, obradu ivica, rupe za šarke i zazore';
      case 'barBlank':
        return 'Pre naručivanja potvrditi obradu ivica, oslonce i pričvršćenja';
    }
  },
  hardware: (item) => {
    switch (item.kind) {
      case 'hinge':
        return item.inset ? 'Skrivena šarka, upuštena' : 'Skrivena šarka, nalegajuća';
      case 'cornerHinge':
        return 'Šarka za ugaona vrata';
      case 'metalDrawer':
        return `Metalni sistem fioke (komplet), ${item.slide} mm`;
      case 'slides':
        return `Klizači s kugličnim ležajem, ${item.slide} mm (par)`;
      case 'handle':
        return `Ručka, ${HANDLES[item.style]}`;
      case 'shelfPin':
        return 'Nosač police';
      case 'hangers':
        return 'Nosači za kačenje gornjeg elementa (par)';
      case 'leg':
        return `Podesiva nogica, ${item.height} mm`;
      case 'glassHinge':
        return 'Šarka / stega za staklena vrata (potvrditi specifikaciju stakla)';
      case 'pullOut':
        return `Izvlačna korpa sa klizačima, element ${item.width} mm (potvrditi model)`;
      case 'barLeg':
        return `Barska noga sa pričvrsnom pločom, ${srMm(item.height)} mm`;
      case 'appliance':
        return `${APPLIANCES[item.appliance]}, element ${item.width} mm (potvrditi model)`;
    }
  },
  material: (material) => (BOARDS[material.id] && originalBoardNames.get(material.id) === material.name ? BOARDS[material.id] : material.name),
  edgeBand: (band) => (BANDS[band.id] && originalBandNames.get(band.id) === band.name ? BANDS[band.id] : band.name),
  unknownBoard: 'Nepoznata ploča',
  invalidParts: 'Ispravite neizvodljive mere delova pre izvoza ili štampe. Nacrt i dalje možete da menjate i sačuvate kao projekat.',
  extra: 'Dodatno',
  changedByHand: 'ručno izmenjeno',
  leftOutByHand: 'ručno izostavljeno',
  edges: (length, width) => `D${length} Š${width}`,
  innerEdges: 'unutrašnje ivice L',
  mm: srMm,
  csvHeader: ['Deo', 'Količina', 'Dužina (mm)', 'Širina (mm)', 'Debljina (mm)', 'Materijal', 'Kant', 'Kant traka', 'Elementi', 'Napomena'],
  checks: {
    overlap: (a, b) => `${a} i ${b} se preklapaju.`,
    outside: (unit) => `${unit} izlazi van prostorije.`,
    ceiling: (unit, top, ceiling) => `${unit} doseže ${top} mm, iznad plafona na ${ceiling} mm.`,
    specialistModule: (unit) => `${unit}: pre izrade potvrditi nišu, ventilaciju, nosivost, pričvršćenja i zazore prema izabranom aparatu ili sistemu.`,
    glassSupplier: (unit) => `${unit}: mere stakla su pripremne; staklorezac potvrđuje sigurnosno staklo, obradu ivica, rupe za šarke i radne zazore.`,
    floatingSupports: (unit) => `${unit}: odaberite nosače lebdećih polica prema zidu, ploči i opterećenju. Nosači nisu na spisku okova.`,
    shelfSpacing: (unit) => `${unit}: nema slobodnog prostora između polica. Povećajte visinu ili smanjite broj polica.`,
    roomFeatureCollision: (unit, feature) => `${unit} se preklapa sa strukturom „${feature}“; oslobodite fiksne delove prostorije.`,
    roomFeatureOutside: (feature) => `${feature} izlazi van korisne osnove prostorije.`,
    chimneyClearance: (feature) => `${feature}: obavezne protivpožarne i toplotne razmake potvrdite sa stručnim izvođačem. Modelirani blok je geometrija, ne proračun zaštite od požara.`,
    frontProfile: 'Shaker reljef je vizuelni prikaz. Krojna lista daje pripremne fronte, ne CNC nacrte ili spojeve; izradu frontova potvrdite sa dobavljačem.',
    handleless: 'Za fronte bez ručki izaberite push-to-open ili profilni sistem. Krojna lista daje pripremne komade, ne specifikaciju obrade ili mehanizama.',
    gap: (gap, a, b, wall) =>
      `Razmak od ${gap} mm između ${b === null ? `${a} i ugla` : `${a} i ${b}`} ${naZidu[wall]}: zatvorite ga ili ga popunite filerom.`,
    lowWallUnit: (unit, clearance) => `${unit} visi samo ${clearance} mm iznad radne ploče ispod sebe; uobičajeno je 500–650 mm.`,
    frontsDoNotFit: (unit) => `Fronte elementa ${unit} ne mogu da stanu: smanjite broj vrata ili fioka.`,
    wideDoors: (unit, width, max) => `${unit} ima vrata široka ${width} mm; vrata šira od ${max} mm se ugibaju. Dodajte još vrata.`,
    lowDoors: (unit, height) => `Vrata elementa ${unit} su visoka samo ${height} mm ispod fioka; smanjite broj fioka.`,
    lowDrawers: (unit) => `Čela fioka elementa ${unit} su preniska za sanduk fioke.`,
    shallowForSlides: (unit, depth) => `${unit} je preplitak za klizače fioka; potrebno je najmanje ${depth} mm unutrašnje dubine.`,
    partTooLarge: (part, unit, length, width, sheet, board) =>
      `${part} elementa ${unit} (${srMm(length)} × ${srMm(width)}) ne staje na ploču ${sheet.sheetLength} × ${sheet.sheetWidth} (${board}).`,
    extraTooLarge: (part, length, width, sheet, board) =>
      `Dodatni deo „${part}“ (${srMm(length)} × ${srMm(width)}) ne staje na ploču ${sheet.sheetLength} × ${sheet.sheetWidth} (${board}).`,
    invalidPart: (part, unit) => `${part} elementa ${unit} ima neizvodljive mere ili materijal. Proverite pravila izrade i ručne izmene.`,
    fridgeByOven: (fridge, oven) => `Frižider ${fridge} stoji odmah pored rerne ${oven}; stavite element ili ploču između njih.`,
    openingDoesNotFit: (kind, wall) => (kind === 'door' ? `Vrata ${naZidu[wall]} ne staju u zid.` : `Prozor ${naZidu[wall]} ne staje u zid.`),
    blocksDoor: (unit, wall) => `${unit} blokira vrata ${naZidu[wall]}.`,
    coversWindow: (unit, wall) => `${unit} zaklanja prozor ${naZidu[wall]}.`,
    windowBelowWorktop: (wall, sill, unit, top) => `Prozor ${naZidu[wall]} počinje na ${sill} mm, ispod radne ploče elementa ${unit} (${top} mm).`,
  },
};
