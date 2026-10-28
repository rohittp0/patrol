import { PLAYTEST_CONFIG } from "./playtest.config";
/** Archive case order retains the original challenges; progressionV2 maps all 25 campaign opponents explicitly. These are
 * historical introductions, not claims that the puzzle reenacts the real chase.
 * Never replace an arrest, surrender, or death with a fictional historical ending.
 * Portraits are generated illustrations; source links support the written facts. */
// A country's case is set there; it does not imply the fugitive was born there.
export interface CaseFile {
  id: string;
  name: string;
  shortName: string;
  title: string;
  era: string;
  intro: string;
  endingDate: string;
  ending: string;
  source: { label: string; url: string };
}

export const CASE_FILES: Record<string, CaseFile[]> = {
  usa: [
    {
      id: "bulger", name: "James ‘Whitey’ Bulger", shortName: "Whitey Bulger", title: "The disappearing mob boss", era: "1990s–2011",
      intro: "The former Winter Hill Gang leader disappeared and stayed on the run for sixteen years. False identities and a quiet life far from Boston kept one of America's most wanted men out of sight.",
      endingDate: "22 June 2011",
      ending: "A publicity campaign brought a tip that led the FBI to Santa Monica, California. Agents watched the apartment, lured Bulger outside, and arrested him without incident alongside his companion Catherine Greig.",
      source: { label: "FBI", url: "https://www.fbi.gov/news/stories/top-ten-fugitive-james-whitey-bulger-arrested" },
    },
    {
      id: "kelly", name: "George ‘Machine Gun’ Kelly", shortName: "Machine Gun Kelly", title: "The ransom trail", era: "1933",
      intro: "The kidnapping of oilman Charles Urschel put Kelly at the centre of a nationwide investigation. Investigators followed the evidence while Kelly and his wife Kathryn looked for somewhere to hide.",
      endingDate: "26 September 1933",
      ending: "Leads from the kidnapping investigation took federal agents to a Memphis hideout. An early-morning raid ended with the arrest of Kelly and his wife Kathryn. Both were later sentenced to life imprisonment.",
      source: { label: "FBI", url: "https://www.fbi.gov/history/cases-and-criminals/machine-gun-kelly" },
    },
    {
      id: "karpis", name: "Alvin Karpis", shortName: "Alvin Karpis", title: "A new name, the same fingerprints", era: "1930s",
      intro: "A leader of the Barker–Karpis gang, Karpis kept moving while other wanted gangsters were caught. He used aliases and even tried to alter his fingertips to avoid identification.",
      endingDate: "1 May 1936",
      ending: "The FBI traced Karpis to New Orleans, where he had been living under an assumed name. Agents arrested him on 1 May 1936, bringing one of the era's longest-running gangster searches to an end.",
      source: { label: "FBI", url: "https://www.fbi.gov/news/stories/a-byte-out-of-history" },
    },
    {
      id: "dillinger", name: "John Dillinger", shortName: "John Dillinger", title: "The jailbreak headline", era: "1933–1934",
      intro: "Bank robberies, stolen cars, and repeated jailbreaks made Dillinger a national headline. His gang moved between Midwestern hideouts while investigators tried to get one step ahead.",
      endingDate: "22 July 1934",
      ending: "An informant led federal agents to Chicago's Biograph Theater. They waited outside while Dillinger watched a film. He was shot and killed as he tried to flee after leaving the theatre.",
      source: { label: "FBI", url: "https://www.fbi.gov/history/cases-and-criminals/john-dillinger" },
    },
    {
      id: "barrow", name: "Clyde Barrow", shortName: "Clyde Barrow", title: "The highway escape artist", era: "1930s",
      intro: "Clyde Barrow and Bonnie Parker crossed state lines in stolen cars, leaving a trail of robberies and violence. Their constant movement made the Barrow gang a difficult target for police.",
      endingDate: "23 May 1934",
      ending: "Officers from Texas and Louisiana tracked the pair's movements and set an ambush near Sailes, Louisiana. Barrow and Parker were killed when their car reached the waiting officers.",
      source: { label: "FBI", url: "https://www.fbi.gov/history/cases-and-criminals/bonnie-and-clyde/bonnie-and-clyde" },
    },
    {
      id: "nelson", name: "Lester ‘Baby Face’ Nelson", shortName: "Baby Face Nelson", title: "The last getaway", era: "1934",
      intro: "Nelson's youthful nickname hid a violent bank robber associated with Dillinger's gang. Stolen cars and changing hideouts kept investigators chasing a moving target.",
      endingDate: "27 November 1934",
      ending: "Federal agents pursued Nelson near Barrington, Illinois. He was fatally wounded in the gun battle that followed; agents Herman Hollis and Samuel Cowley also died. The manhunt ended that night.",
      source: { label: "FBI", url: "https://www.fbi.gov/history/cases-and-criminals/lester-gillis-baby-face-nelson" },
    },
    {"id": "sutton", "name": "Willie Sutton", "shortName": "Willie Sutton", "title": "The disguise trail", "era": "1920s–1952", "intro": "Sutton used disguises and prison escapes during a long career of bank robbery. Investigators circulated his photograph as they searched for a man who could change his appearance and start again under another name.", "endingDate": "18 February 1952", "ending": "A citizen recognized Sutton from a wanted photograph and alerted police. He was arrested in Brooklyn in February 1952, ending this chapter of his time on the run.", "source": {"label": "FBI", "url": "https://www.fbi.gov/history/cases-and-criminals/willie-sutton"}},
    {"id": "floyd", "name": "Charles “Pretty Boy” Floyd", "shortName": "Charles “Pretty Boy” Floyd", "title": "Across the plains", "era": "1930s–1934", "intro": "Floyd moved between Midwestern hideouts while pursued for bank robberies and his alleged role in the Kansas City Massacre. A changing network of associates and stolen vehicles made the search difficult.", "endingDate": "22 October 1934", "ending": "Federal agents and local officers located Floyd near East Liverpool, Ohio. He was shot and killed on 22 October 1934. This game pursuit is fictional and does not rewrite that outcome.", "source": {"label": "FBI", "url": "https://www.fbi.gov/history/cases-and-criminals/kansas-city-massacre-pretty-boy-floyd"}},
    {"id": "doc-barker", "name": "Arthur “Doc” Barker", "shortName": "Arthur “Doc” Barker", "title": "The fingerprint lead", "era": "1930s–1935", "intro": "Arthur Barker was part of the Barker–Karpis gang. A fingerprint found on a discarded fuel can helped investigators connect the gang to a kidnapping and begin closing in on its members.", "endingDate": "8 January 1935", "ending": "Agents arrested Arthur Barker without incident in Chicago in January 1935. The investigation then led officers toward other members of the gang.", "source": {"label": "FBI", "url": "https://www.fbi.gov/news/stories/copy_of_a-byte-out-of-history"}},
    {"id": "fred-barker", "name": "Fred Barker", "shortName": "Fred Barker", "title": "The lakeside hideout", "era": "1930s–1935", "intro": "Fred Barker operated with the Barker–Karpis gang. After investigators linked members of the group to kidnappings, arrests and clues narrowed the search to a hideout beside a Florida lake.", "endingDate": "16 January 1935", "ending": "Agents surrounded a house on Lake Weir, Florida. Fred and his mother Kate Barker were killed in the ensuing gun battle in January 1935. The fictional level does not change their historical fate.", "source": {"label": "FBI", "url": "https://www.fbi.gov/news/stories/copy_of_a-byte-out-of-history"}},
    {"id": "morris", "name": "Frank Lee Morris", "shortName": "Frank Lee Morris", "title": "Beyond the island", "era": "1962 · unresolved", "intro": "Morris and the Anglin brothers vanished from Alcatraz after constructing dummy heads and preparing an escape. The search spread through San Francisco Bay and beyond, but no confirmed conclusion established what happened to the three men.", "endingDate": "11 June 1962 · unresolved", "ending": "The FBI closed its Alcatraz investigation in 1979 without definitively establishing the escapees’ fate. Morris was not confirmed captured; the mainland pursuit in this level is imagined.", "source": {"label": "FBI", "url": "https://www.fbi.gov/history/cases-and-criminals/alcatraz-escape"}},
    {"id": "ray", "name": "James Earl Ray", "shortName": "James Earl Ray", "title": "A trail across borders", "era": "1967–1968", "intro": "Ray escaped from prison in Missouri before becoming the subject of the international manhunt following the assassination of Martin Luther King Jr. Investigators traced aliases, travel and fingerprints as the search crossed national borders.", "endingDate": "8 June 1968", "ending": "British authorities arrested Ray at London’s Heathrow Airport on 8 June 1968. This fictional USA pursuit does not move the historical arrest from London.", "source": {"label": "FBI", "url": "https://www.fbi.gov/wanted/topten/topten-history/hires_images/FBI-277-JamesEarlRay.jpg/view"}},
    {"id": "kaczynski", "name": "Ted Kaczynski", "shortName": "Ted Kaczynski", "title": "The remote cabin", "era": "1978–1996", "intro": "A long investigation sought the person responsible for a series of mailed bombs. Family members recognized ideas and language in published writings, bringing investigators a lead that helped identify Kaczynski.", "endingDate": "3 April 1996", "ending": "Agents arrested Kaczynski at his remote cabin near Lincoln, Montana, on 3 April 1996. Evidence recovered there helped bring the bombing investigation to an end.", "source": {"label": "FBI", "url": "https://www.fbi.gov/history/cases-and-criminals/unabomber"}},
    {"id": "rudolph", "name": "Eric Robert Rudolph", "shortName": "Eric Robert Rudolph", "title": "The mountain search", "era": "1998–2003", "intro": "Rudolph evaded a large manhunt after being sought for a series of bombings. The search focused on the mountains of western North Carolina, where terrain and long stretches without reliable sightings complicated the pursuit.", "endingDate": "31 May 2003", "ending": "A police officer arrested Rudolph in Murphy, North Carolina, on 31 May 2003. The arrest ended his years as a fugitive; he later pleaded guilty to the bombings.", "source": {"label": "FBI", "url": "https://www.fbi.gov/history/cases-and-criminals/eric-rudolph"}},
    {"id": "holden", "name": "Thomas James Holden", "shortName": "Thomas James Holden", "title": "The first wanted poster", "era": "1950–1951", "intro": "Holden became the first person placed on the FBI’s Ten Most Wanted Fugitives list in March 1950. Nationwide publicity brought his photograph to readers far from the place where investigators first began looking for him.", "endingDate": "23 June 1951", "ending": "A newspaper reader recognized Holden and contacted investigators. Agents arrested him near Beaverton, Oregon, on 23 June 1951.", "source": {"label": "FBI", "url": "https://www.fbi.gov/wanted/topten/ten-most-wanted-fugitives-faq/ten-most-wanted-1-100"}},
    {"id": "cooper", "name": "D. B. Cooper", "shortName": "D. B. Cooper", "title": "The vanishing skyjacker", "era": "1971 · unresolved", "intro": "A man using the name Dan Cooper hijacked an airliner, obtained ransom money and parachuted from the aircraft. The name D. B. Cooper became attached to a search whose central questions remained unanswered.", "endingDate": "24 November 1971 · unresolved", "ending": "Cooper’s identity and fate have not been conclusively established. The FBI redirected resources from the investigation in 2016. This illustrated character is an interpretation of a composite, and capture in the game is fictional.", "source": {"label": "FBI", "url": "https://www.fbi.gov/history/cases-and-criminals/db-cooper-hijacking"}},
  ],
  india: [
    {
      id: "veerappan", name: "Veerappan", shortName: "Veerappan", title: "The forest trail", era: "1980s–2004",
      intro: "Veerappan used the forests of southern India to evade a long police hunt. His smuggling gang's knowledge of the terrain made every lead difficult to follow.",
      endingDate: "18 October 2004",
      ending: "Operation Cocoon drew Veerappan out of the forest in a disguised ambulance. According to the task-force commander's account, police surrounded the vehicle near Dharmapuri. Veerappan and three associates were killed in the ensuing operation.",
      source: { label: "The Indian Express", url: "https://indianexpress.com/article/india/promises-of-eye-treatment-ltte-arms-led-veerappan-to-stf-trap-4513236/" },
    },
    {
      id: "sobhraj", name: "Charles Sobhraj", shortName: "Charles Sobhraj", title: "The Serpent slips away", era: "India, 1986",
      intro: "Already imprisoned in India, Sobhraj escaped from Delhi's Tihar Jail in March 1986. The international criminal's latest escape put police on a trail that stretched to Goa.",
      endingDate: "6 April 1986",
      ending: "Indian police found Sobhraj at a restaurant in Goa, three weeks after the Tihar breakout. Officers posing as waiters arrested him and fellow escapee David Hall, returning Sobhraj to custody.",
      source: { label: "UPI archive", url: "https://www.upi.com/Archives/1986/04/07/Police-arrest-suspected-bikini-killer/9013050234051/" },
    },
    {
      id: "phoolan", name: "Phoolan Devi", shortName: "Phoolan Devi", title: "The Chambal negotiations", era: "Early 1980s",
      intro: "Known as the Bandit Queen, Phoolan Devi became one of the best-known figures in the Chambal ravines. Her pursuit unfolded amid violence, caste conflict, and negotiations with the authorities.",
      endingDate: "1983",
      ending: "Devi surrendered in Bhind, Madhya Pradesh, in 1983 after negotiations. Her story continued beyond custody: she was released years later and entered politics, becoming a member of India's parliament.",
      source: { label: "The Indian Express", url: "https://indianexpress.com/article/india/behmai-massacre-case-original-diary-missing-court-defers-verdict-6223817/" },
    },
    {
      id: "raghav", name: "Raman Raghav", shortName: "Raman Raghav", title: "A face in the crowd", era: "Bombay, 1968",
      intro: "A series of killings terrified Bombay in 1968. Police circulated Raghav's photograph, and a young officer kept a copy in his pocket while searching the city.",
      endingDate: "August 1968",
      ending: "Sub-inspector Alex Fialho recognised Raghav in Dongri. A wet umbrella on a sunny day helped draw his attention: Raghav said he had come from rainy Malad, where police had been looking for him. The street encounter ended in arrest.",
      source: { label: "The Indian Express", url: "https://indianexpress.com/article/cities/mumbai/mumbai-policeman-who-nabbed-big-ticket-serial-killer-raman-raghav-dies-7051800/" },
    },
    {
      id: "tomar", name: "Paan Singh Tomar", shortName: "Paan Singh Tomar", title: "From the track to the ravines", era: "1970s–1981",
      intro: "Tomar had been an army soldier and successful athlete before becoming a Chambal outlaw. A land dispute and a turn to violence transformed his life into a police manhunt.",
      endingDate: "1 October 1981",
      ending: "A police operation in Bhind district cornered Tomar and his gang. The prolonged encounter, led by superintendent Vijay Raman, ended with Tomar's death on 1 October 1981.",
      source: { label: "The Indian Express", url: "https://indianexpress.com/article/cities/pune/vijay-raman-ips-officer-paan-singh-tomar-memoirs-9570184/" },
    },
    {
      id: "malkhan", name: "Malkhan Singh", shortName: "Malkhan Singh", title: "The ravines give up their secret", era: "1970s–1982",
      intro: "Malkhan Singh's gang used the Chambal ravines as a stronghold. The terrain helped him stay beyond the reach of police for years, until the pursuit took a different turn.",
      endingDate: "1982",
      ending: "Singh emerged from the ravines and surrendered in Bhind in 1982 before Madhya Pradesh chief minister Arjun Singh. The public surrender ended his years on the run; he later took part in electoral politics.",
      source: { label: "The Indian Express", url: "https://indianexpress.com/article/political-pulse/baba-bandit-king-kamal-nath-dacoits-bundelkhand-8885444/" },
    },
  ],
  hungary: [
    {
      id: "ambrus", name: "Attila Ambrus", shortName: "Attila Ambrus", title: "The Whiskey Robber", era: "1990s–1999",
      intro: "Bank robber Attila Ambrus became known as the Whiskey Robber. After escaping custody, he prompted a search filled with sightings, false leads, and repeated raids.",
      endingDate: "27 October 1999",
      ending: "After a long investigation, Hungarian police surrounded his Budapest apartment. An officer who took part recalled Ambrus coming to the door and surrendering. He was handcuffed and taken back into custody.",
      source: { label: "Hungarian Police", url: "https://www.police.hu/hu/hirek-es-informaciok/legfrissebb-hireink/zsaru-magazin/kulonleges-egyseg-aki-a-viszkist-is" },
    },
    {
      id: "rozsa", name: "Sándor Rózsa", shortName: "Sándor Rózsa", title: "The Great Plain outlaw", era: "19th century",
      intro: "Rózsa's escapes and robberies made him one of Hungary's best-known outlaws. Prison, a pardon, and a return to his old life kept his story in the public eye.",
      endingDate: "19th century",
      ending: "Rózsa was hunted down again after returning to robbery following a pardon. His final imprisonment ended at Szamosújvár, where he died in 1878. Folklore later mixed his real crimes with invented adventures.",
      source: { label: "Hungarian National Library", url: "https://www.mek.oszk.hu/02100/02115/html/4-1033.html" },
    },
    {
      id: "savanyu", name: "Jóska Savanyú", shortName: "Jóska Savanyú", title: "A betrayal in the Bakony", era: "1870s–1884",
      intro: "Savanyú hid among the Bakony forests while his gang robbed across western Hungary. Rewards and searches failed to end the chase; someone close to him eventually changed that.",
      endingDate: "1884",
      ending: "An associate betrayed Savanyú to the authorities. A historical account describes a sleeping draught slipped into his wine before gendarmes arrested him. He received a prison sentence and was eventually released after twenty years.",
      source: { label: "Múlt-kor history magazine", url: "https://mult-kor.hu/megmenekult-a-koteltol-de-meg-az-eletfogytiglantol-is-savanyu-joska-20230409" },
    },
    {
      id: "matuska", name: "Szilveszter Matuska", shortName: "Szilveszter Matuska", title: "The railway investigation", era: "1931",
      intro: "The bombing of the Biatorbágy railway viaduct set off an investigation across borders. Matuska, who had appeared at the scene, became the focus as investigators connected several rail attacks.",
      endingDate: "October 1931",
      ending: "Cooperation between Austrian and Hungarian investigators led to Matuska's arrest in Vienna in October 1931. After being caught, he admitted responsibility for three attacks on the railways.",
      source: { label: "Rubicon history magazine", url: "https://rubicon.hu/hu/kalendarium/1931-szeptember-13-matuska-szilveszter-felrobbantja-a-biatorbagyi-viaduktot" },
    },
    {
      id: "milfajt", name: "Ferkó Milfajt", shortName: "Ferkó Milfajt", title: "The escape that unravelled", era: "1836",
      intro: "Milfajt led part of Sobri Jóska's outlaw band across western Hungary. When the gang divided its territory, the authorities widened their search across several counties.",
      endingDate: "December 1836",
      ending: "Béla Tóth's nineteenth-century account says an accidental gunshot to the leg left Milfajt unable to escape. He was captured and executed in Veszprém in December 1836, before the hunt for Sobri ended.",
      source: { label: "Hungarian National Library · Béla Tóth", url: "https://mek.oszk.hu/06800/06825/html/index.htm" },
    },
    {
      id: "sobri", name: "Jóska Sobri", shortName: "Jóska Sobri", title: "The forest closes in", era: "1830s",
      intro: "Sobri's band moved through the forests of western Hungary while soldiers and county forces pursued them. His short outlaw career grew into one of Hungary's most enduring bandit legends.",
      endingDate: "February 1837",
      ending: "Pursuing forces surrounded Sobri's band at Lápafő in February 1837. His manhunt ended there. Later accounts disagree about his final moments, showing how quickly a real pursuit became folklore.",
      source: { label: "Rubicon history magazine", url: "https://rubicon.hu/hu/kalendarium/1837-februar-17-sobri-joska-halala" },
    },
  ],
};

export function caseForChallenge(country: string, index: number): CaseFile {
  const file = CASE_FILES[country]?.[index];
  if (!file) throw new Error(`No case file for ${country} challenge ${index + 1}`);
  return file;
}

export const portraitPath = (file: CaseFile) => `portraits/${file.id}.webp`;

/** Campaign encounters are fictional; case biographies retain their historical settings and outcomes. */
export function caseForLevel(level: number): CaseFile {
  const opponent = PLAYTEST_CONFIG.progressionV2.opponents[level - 1];
  const file = Object.values(CASE_FILES).flat().find(file => file.id === opponent?.caseId);
  if (!file) throw new Error(`Unknown campaign opponent: ${level}`);
  return file;
}
