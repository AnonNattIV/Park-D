import 'server-only';

const THAI_CHAR_REGEX = /[\u0E00-\u0E7F]/;

const KNOWN_THAI_WORDS: Array<[string, string]> = [
  [
    '\u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E\u0E21\u0E2B\u0E32\u0E19\u0E04\u0E23',
    'Bangkok',
  ],
  ['\u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E', 'Bangkok'],
];

const KNOWN_ENGLISH_WORDS: Array<[string, string]> = [
  ['Bangkok', '\u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E'],
  ['Krung Thep', '\u0E01\u0E23\u0E38\u0E07\u0E40\u0E17\u0E1E'],
  ['Chiang Mai', '\u0E40\u0E0A\u0E35\u0E22\u0E07\u0E43\u0E2B\u0E21\u0E48'],
  ['Chonburi', '\u0E0A\u0E25\u0E1A\u0E38\u0E23\u0E35'],
  ['Nakhon Ratchasima', '\u0E19\u0E04\u0E23\u0E23\u0E32\u0E0A\u0E2A\u0E35\u0E21\u0E32'],
  ['Khon Kaen', '\u0E02\u0E2D\u0E19\u0E41\u0E01\u0E48\u0E19'],
  ['Phuket', '\u0E20\u0E39\u0E40\u0E01\u0E47\u0E15'],
  ['Songkhla', '\u0E2A\u0E07\u0E02\u0E25\u0E32'],
  ['Surat Thani', '\u0E2A\u0E38\u0E23\u0E32\u0E29\u0E0E\u0E23\u0E4C\u0E18\u0E32\u0E19\u0E35'],
  ['Nakhon Si Thammarat', '\u0E19\u0E04\u0E23\u0E28\u0E23\u0E35\u0E18\u0E23\u0E23\u0E21\u0E23\u0E32\u0E0A'],
  ['Ratchaburi', '\u0E23\u0E32\u0E0A\u0E1A\u0E38\u0E23\u0E35'],
  ['Nonthaburi', '\u0E19\u0E19\u0E17\u0E1A\u0E38\u0E23\u0E35'],
  ['Pathum Thani', '\u0E1B\u0E17\u0E38\u0E21\u0E18\u0E32\u0E19\u0E35'],
  ['Samut Prakan', '\u0E2A\u0E21\u0E38\u0E17\u0E23\u0E1B\u0E23\u0E32\u0E01\u0E32\u0E23'],
  ['Samut Sakhon', '\u0E2A\u0E21\u0E38\u0E17\u0E23\u0E2A\u0E32\u0E04\u0E23'],
  [
    'Phra Nakhon Si Ayutthaya',
    '\u0E1E\u0E23\u0E30\u0E19\u0E04\u0E23\u0E28\u0E23\u0E35\u0E2D\u0E22\u0E38\u0E18\u0E22\u0E32',
  ],
  ['Ubon Ratchathani', '\u0E2D\u0E38\u0E1A\u0E25\u0E23\u0E32\u0E0A\u0E18\u0E32\u0E19\u0E35'],
  ['Udon Thani', '\u0E2D\u0E38\u0E14\u0E23\u0E18\u0E32\u0E19\u0E35'],
  ['Nakhon Pathom', '\u0E19\u0E04\u0E23\u0E1B\u0E10\u0E21'],
  ['Chachoengsao', '\u0E09\u0E30\u0E40\u0E0A\u0E34\u0E07\u0E40\u0E17\u0E23\u0E32'],
  ['Amphoe', '\u0E2D\u0E33\u0E40\u0E20\u0E2D'],
  ['Tambon', '\u0E15\u0E33\u0E1A\u0E25'],
  ['Province', '\u0E08\u0E31\u0E07\u0E2B\u0E27\u0E31\u0E14'],
  ['Subdistrict', '\u0E41\u0E02\u0E27\u0E07'],
  ['District', '\u0E40\u0E02\u0E15'],
  ['Road', '\u0E16\u0E19\u0E19'],
  ['Soi', '\u0E0B\u0E2D\u0E22'],
];

const THAI_DIGIT_MAP: Record<string, string> = {
  '\u0E50': '0',
  '\u0E51': '1',
  '\u0E52': '2',
  '\u0E53': '3',
  '\u0E54': '4',
  '\u0E55': '5',
  '\u0E56': '6',
  '\u0E57': '7',
  '\u0E58': '8',
  '\u0E59': '9',
};

const THAI_CHAR_MAP: Record<string, string> = {
  '\u0E01': 'k',
  '\u0E02': 'kh',
  '\u0E03': 'kh',
  '\u0E04': 'kh',
  '\u0E05': 'kh',
  '\u0E06': 'kh',
  '\u0E07': 'ng',
  '\u0E08': 'ch',
  '\u0E09': 'ch',
  '\u0E0A': 'ch',
  '\u0E0B': 's',
  '\u0E0C': 'ch',
  '\u0E0D': 'y',
  '\u0E0E': 'd',
  '\u0E0F': 't',
  '\u0E10': 'th',
  '\u0E11': 'th',
  '\u0E12': 'th',
  '\u0E13': 'n',
  '\u0E14': 'd',
  '\u0E15': 't',
  '\u0E16': 'th',
  '\u0E17': 'th',
  '\u0E18': 'th',
  '\u0E19': 'n',
  '\u0E1A': 'b',
  '\u0E1B': 'p',
  '\u0E1C': 'ph',
  '\u0E1D': 'f',
  '\u0E1E': 'ph',
  '\u0E1F': 'f',
  '\u0E20': 'ph',
  '\u0E21': 'm',
  '\u0E22': 'y',
  '\u0E23': 'r',
  '\u0E24': 'rue',
  '\u0E25': 'l',
  '\u0E26': 'lue',
  '\u0E27': 'w',
  '\u0E28': 's',
  '\u0E29': 's',
  '\u0E2A': 's',
  '\u0E2B': 'h',
  '\u0E2C': 'l',
  '\u0E2D': 'o',
  '\u0E2E': 'h',
  '\u0E30': 'a',
  '\u0E31': 'a',
  '\u0E32': 'a',
  '\u0E33': 'am',
  '\u0E34': 'i',
  '\u0E35': 'i',
  '\u0E36': 'ue',
  '\u0E37': 'ue',
  '\u0E38': 'u',
  '\u0E39': 'u',
  '\u0E40': 'e',
  '\u0E41': 'ae',
  '\u0E42': 'o',
  '\u0E43': 'ai',
  '\u0E44': 'ai',
  '\u0E45': 'a',
  '\u0E2F': '.',
  '\u0E46': '',
  '\u0E47': '',
  '\u0E48': '',
  '\u0E49': '',
  '\u0E4A': '',
  '\u0E4B': '',
  '\u0E4C': '',
  '\u0E4D': '',
  '\u0E3A': '',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceKnownThaiWords(value: string): string {
  return KNOWN_THAI_WORDS.reduce((currentValue, [thaiWord, englishWord]) => {
    const pattern = new RegExp(escapeRegExp(thaiWord), 'g');
    return currentValue.replace(pattern, englishWord);
  }, value);
}

function replaceKnownEnglishWords(value: string): string {
  return [...KNOWN_ENGLISH_WORDS]
    .sort((left, right) => right[0].length - left[0].length)
    .reduce((currentValue, [englishWord, thaiWord]) => {
      const pattern = new RegExp(`\\b${escapeRegExp(englishWord)}\\b`, 'gi');
      return currentValue.replace(pattern, thaiWord);
    }, value);
}

function transliterateRemainingThai(value: string): string {
  let output = '';

  for (const char of value) {
    if (THAI_DIGIT_MAP[char]) {
      output += THAI_DIGIT_MAP[char];
      continue;
    }

    if (THAI_CHAR_MAP[char] !== undefined) {
      output += THAI_CHAR_MAP[char];
      continue;
    }

    output += char;
  }

  return output;
}

export function translateThaiToEnglishText(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '';
  }

  if (!THAI_CHAR_REGEX.test(normalizedValue)) {
    return normalizedValue;
  }

  const withKnownWords = replaceKnownThaiWords(normalizedValue);
  const transliterated = transliterateRemainingThai(withKnownWords);

  return transliterated
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .trim();
}

export function translateToThaiDisplayText(value: string): string {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return '';
  }

  if (THAI_CHAR_REGEX.test(normalizedValue)) {
    return normalizedValue;
  }

  const translated = replaceKnownEnglishWords(normalizedValue);

  return translated
    .replace(/\s+/g, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*/g, ', ')
    .trim();
}
