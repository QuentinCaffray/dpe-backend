const CHUNK_SIZE = 15000;       // caractères par morceau
const INPUT_THRESHOLD = 40000;  // au-delà de ça, on passe en mode chunks

const CHUNK_SUMMARY_PROMPT = `Tu es un assistant spécialisé en extraction de données DPE (Diagnostic de Performance Énergétique) et PPPT (Plan Pluriannuel de Travaux).

À partir du texte fourni, extrais et garde UNIQUEMENT ces informations, si elles sont présentes :

Identification du bien :
- Adresse, nom de la résidence
- Année de construction
- Type de bien (maison individuelle, appartement, copropriété)
- Surface habitable (en m²)
- Nombre de lots / logements si copropriété

Score énergétique :
- Classe énergétique (lettre A à G) et émissions CO2 (kgéqCO2/m².an)
- Consommation en énergie primaire (kWhEP/m².an)
- Coût annuel estimé de l'énergie (en €)

État du bâti :
- Plancher bas : type, présence d'isolation, état
- Plancher haut / combles / toiture : type, présence d'isolation, état
- Façades / murs : type de mur, isolation intérieure ou extérieure, état
- Menuiseries : type de vitrage (simple, double, triple), Uw si disponible
- Ventilation : type (VMC simple flux, double flux, naturelle), état, année d'installation

Équipements :
- Chauffage : type, âge, puissance, efficacité (SCOP, rendement)
- Eau chaude sanitaire : type, âge, efficacité
- Compteurs : type d'énergie utilisée (électricité, gaz, fioul, bois)

Analyse énergétique :
- Déperditions thermiques par poste si détaillées (murs, toiture, planchers, menuiseries, ponts thermiques)
- Consommation par usage si détaillée (chauffage, ECS, éclairage, auxiliaires)

Travaux recommandés (pour chaque travail mentionné) :
- Description du travail
- Priorité si indiquée (P0/P1/P2/P3/P4 ou urgent/recommandé/optionnel)
- Classe énergétique avant et après travaux
- Gain en % d'énergie primaire et en % d'émissions CO2
- Estimation du coût si disponible

Scénarios / bouquets de travaux :
- Description du scénario (ensemble de travaux combinés)
- Classe avant et après
- Économies en € par an
- Investissement total estimé

Aides et subventions mentionnées :
- CEE (Certificats d'Économies d'Énergie) et montants estimés
- MaPrimeRenov ou autres aides

Présente les données extraites sous forme de liste claire et structurée. Ne garde rien qui ne soit pas une information concrète ou chiffrée. Ne rajoute aucune interprétation.`;

const VULGARIZE_PROMPT = `Tu es un conseiller énergétique qui vulgarise un DPE (Diagnostic de Performance Énergétique) ou un PPPT (Plan Pluriannuel de Travaux) pour un propriétaire particulier.

Ton objectif : produire un rapport clair, professionnel et rassurant qui aide le propriétaire à comprendre l'état énergétique de son bien et ce qu'il peut faire pour l'améliorer.

Règles de style :
- Ton professionnel mais accessible, pas de jargon non expliqué. Si un terme technique est nécessaire, explique-le en une phrase.
- Chaque recommandation accompagnée de sa conséquence concrète (ex : économiser X€/an, passer de classe D à C)
- Garde les valeurs exactes quand elles sont disponibles dans les données
- Sois direct : évite "il est conseillé de", "il est recommandé de" — formule en action
- Si une donnée manque, ne l'invente pas : indique "information non disponible"
- Pour les priorités : "urgent" = sécurité ou risque d'aggravation, "recommandé" = gain significatif, "optionnel" = amélioration marginale

Structure attendue (utilise ces titres exactement) :

# Vue d'ensemble
2-3 phrases qui résument l'état énergétique du bien. Mentionne la classe actuelle et ce qu'elle signifie. Si le bien est une copropriété, mentionne le nombre de logements et les bâtiments concernés. Exemple : "Votre logement est classé D : une performance énergétique moyenne, typique d'un bien construit avant les années 2000."

# Votre score énergétique
- Classe énergétique actuelle et sa signification (scale de A à G)
- Classe climat (émissions CO2) si disponible
- Consommation en énergie primaire (kWhEP/m².an) si disponible
- Coût annuel estimé de l'énergie
- Émissions de CO2 annuelles

# Description du bien
- Adresse ou nom de la résidence si disponible
- Année de construction
- Surface habitable
- Type de bien (maison, appartement, copropriété avec nombre de lots)

# État de votre logement
Décris chaque poste clairement. Pour chaque point, indique si l'état est bon, acceptable ou à améliorer.

## Isolation
- Murs / façades : type d'isolation (intérieure, extérieure), état
- Toiture / combles : type, état
- Plancher bas : type, état

## Menuiseries
- Type de vitrage (simple, double, double à isolation renforcée, triple)
- État général

## Équipements de chauffage
- Type de système (poêle, chaudière, pompe à chaleur, convecteur électrique, etc.)
- Âge et efficacité si disponibles

## Eau chaude sanitaire
- Type de système (ballon électrique, ballon thermodynamique, chaudière mutualisée, etc.)
- Âge et efficacité si disponibles

## Ventilation
- Type (VMC simple flux, VMC double flux, ventilation naturelle)
- État et année d'installation si disponibles

# Analyse des déperditions
Si des données sur les déperditions thermiques sont disponibles, présente un résumé simple : où l'énergie est-elle principalement perdue ? (murs, toiture, menuiseries, planchers, ponts thermiques). Utilise des pourcentages ou des proportions relatives si disponibles. Si ces données ne sont pas disponibles, omets cette section entièrement.

# Ce que vous pouvez faire
Liste des travaux recommandés, triés du plus impactant au moins impactant. Pour chaque travail :
- Description claire en langage simple
- Classe énergétique avant → après si disponible
- Gain attendu en % d'énergie et/ou en €/an
- Coût estimé si disponible
- Priorité : urgent / recommandé / optionnel

Si plusieurs travaux sont combinés en un scénario (bouquet de travaux), présente aussi le scénario global après la liste individuelle :
- Ensemble des travaux du scénario
- Classe cible atteinte
- Économies totales estimées en €/an
- Investissement total estimé

# Gestes simples pour économiser
Une liste courte (5-7 points) de conseils pratiques et gratuits : régulation de température, fermeture des volets la nuit, aération, entretien des équipements, etc. Adapte ces conseils au profil du bien.

# Aides financières
Si des aides sont mentionnées dans les données (MaPrimeRenov, CEE, prêt collectif copropriété, etc.), liste-les brièvement avec les montants si disponibles. Sinon, mentionne que des aides peuvent exister sans inventer de chiffres.

# À retenir
2-3 points essentiels à retenir de ce diagnostic. Inclus la priorité n°1 parmi les travaux.

Mise en forme des tableaux :
Utilise des tableaux markdown chaque fois qu'ils améliorent la lisibilité. Exemples d'où les utiliser :
- Score énergétique : tableau avec les indicateurs et leurs valeurs
- État du logement : tableau récapitulatif par poste (isolation, menuiseries, etc.) avec un état (bon / à améliorer)
- Travaux recommandés : tableau avec description, priorité, gain, coût estimé
- Scénarios de travaux : tableau avec les détails du scénario
- Aides financières : tableau avec le nom de l'aide et le montant

Format markdown attendu pour les tableaux :
| En-tête 1 | En-tête 2 |
| --- | --- |
| valeur 1 | valeur 2 |

Réponds uniquement avec le contenu structuré selon cette structure. Aucune introduction ni remarque en dehors.`;

const BATCH_SIZE = 1;          // séquentiel pour respecter le rate limit free tier
const MAX_RETRIES = 5;         // tentatives sur 429

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callMistral({ system, user, maxTokens = 3000 }) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: maxTokens,
      }),
    });

    const data = await response.json();

    if (response.status === 429 && attempt < MAX_RETRIES - 1) {
      const delay = 3000 * Math.pow(2, attempt); // 3s, 6s, 12s, 24s
      console.log(`Rate limit (chunk retry ${attempt + 1}/${MAX_RETRIES}), attente ${delay}ms`);
      await sleep(delay);
      continue;
    }

    if (!response.ok) {
      console.error('Mistral error:', response.status, JSON.stringify(data));
      throw new Error(data.message || data.detail || `Mistral ${response.status}`);
    }

    return data.choices[0].message.content;
  }
}

async function summarizeChunks(text) {
  const chunks = [];
  for (let i = 0; i < text.length; i += CHUNK_SIZE) {
    chunks.push(text.slice(i, i + CHUNK_SIZE));
  }

  console.log(`Texte long détecté (${text.length} chars). ${chunks.length} chunks, batches de ${BATCH_SIZE}.`);

  const summaries = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
    const results = await Promise.all(
      batch.map((chunk) => callMistral({ system: CHUNK_SUMMARY_PROMPT, user: chunk, maxTokens: 1024 }))
    );
    summaries.push(...results);
  }

  return summaries.join('\n\n---\n\n');
}

// Post-traitement : on parse la sortie Mistral pour injecter les marqueurs de graphiques.
// On ne demande pas à Mistral de les produire lui-même — les LLM ne suivent pas ces formats fiablement.
function injectCharts(text) {
  let result = text;

  // ─── Étiquette énergétique ───
  const classeMatch = text.match(/Classe\s+énergétique\s+actuelle\s*\|\s*([A-G])/i);
  const co2Match    = text.match(/Classe\s+climat[^|]*\|\s*([A-G])/i);

  if (classeMatch) {
    const data = { classe: classeMatch[1] };
    if (co2Match) data.classe_co2 = co2Match[1];
    const marker = `<!-- chart-classe:${JSON.stringify(data)} -->`;
    result = result.replace(/(# Votre score énergétique[^\n]*\n)/, `$1${marker}\n`);
  }

  // ─── Camembert déperditions ───
  const depSectionMatch = result.match(/# Analyse des déperditions\n([\s\S]*?)(?=\n# |$)/);
  if (depSectionMatch) {
    const section = depSectionMatch[1];
    const keywords = {
      murs:             /murs/i,
      toiture:          /toiture/i,
      menuiseries:      /menuiseries/i,
      planchers:        /planchers/i,
      ponts_thermiques: /ponts\s*thermiques/i,
    };
    const depData = {};

    for (const [key, pattern] of Object.entries(keywords)) {
      // Format tableau : | Murs | 30% | ou | Murs | 30 |
      const tableRe = new RegExp(pattern.source + `[^|]*\\|\\s*(\\d+)\\s*%?`, 'i');
      // Format prose  : "les murs représentent 30%" ou "murs : 30%"
      const proseRe  = new RegExp(pattern.source + `[^\\d]{0,40}(\\d+)\\s*%`, 'i');

      const match = section.match(tableRe) || section.match(proseRe);
      if (match) depData[key] = parseInt(match[1]);
    }

    if (Object.keys(depData).length >= 2) {
      const marker = `<!-- chart-deperditions:${JSON.stringify(depData)} -->`;
      result = result.replace(/(## Analyse des déperditions[^\n]*\n)/, `$1${marker}\n`);
    }
  }

  return result;
}

async function vulgarize(technicalText) {
  const textToVulgarize = technicalText.length > INPUT_THRESHOLD
    ? await summarizeChunks(technicalText)
    : technicalText;

  const raw = await callMistral({
    system: VULGARIZE_PROMPT,
    user: `Voici le contenu technique du DPE à vulgariser :\n\n${textToVulgarize}`,
    maxTokens: 4000,
  });

  return injectCharts(raw);
}

module.exports = { vulgarize };
