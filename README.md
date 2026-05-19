# 🐍 Snake AI

Klasyczna gra Snake z wbudowanym agentem uczącym się opartym na **Deep Q-Network (DQN)** i bibliotece **TensorFlow.js**.

## GitHub Pages

https://krzysztofglab.github.io/snake.ai/

## Tryby gry

| Tryb | Opis |
|---|---|
| **Human** | Sterowanie klawiaturą (strzałki / WASD) lub ekranowym D-padem |
| **AI** | Agent DQN uczy się grać samodzielnie, w czasie rzeczywistym w przeglądarce |

## Technologie

- **TensorFlow.js 4.22** – trening i inferecja sieci neuronowej w przeglądarce
- **Tailwind CSS** (CDN) – stylowanie interfejsu
- **Vanilla JS** – logika gry, środowisko (env), agent i renderowanie

## Struktura plików

```
snake.ai/
├── index.html               # Główny plik aplikacji
└── assets/
    ├── css/
    │   └── snake.css        # Style niestandardowe
    └── js/
        ├── snake.js         # Logika gry (Human mode)
        ├── snake-env.js     # Środowisko RL (stan, nagrody, reset)
        ├── snake-agent.js   # Agent DQN (sieć, replay buffer, trening)
        └── snake-ai.js      # Pętla treningowa AI i aktualizacja UI
```

## Uruchomienie

Otwórz `index.html` bezpośrednio w przeglądarce lub uruchom przez lokalny serwer (np. XAMPP):

```
http://localhost/snake.ai/
```

## Sterowanie (tryb Human)

| Klawisz | Akcja |
|---|---|
| `↑ / W` | Góra |
| `↓ / S` | Dół |
| `← / A` | Lewo |
| `→ / D` | Prawo |
| `Space` | Start / Pauza |

## Statystyki AI

W trybie AI wyświetlane są na żywo:

- **Episode** – numer aktualnego epizodu treningowego
- **Best** – najlepszy wynik wszech czasów
- **Avg(100)** – średni wynik z ostatnich 100 epizodów
- **Epsilon ε** – współczynnik eksploracji (maleje w czasie)
- **Loss** – wartość funkcji straty sieci
- **Buffer** – rozmiar replay buffer

## Algorytm

Agent wykorzystuje **DQN** z:
- replay memory (experience replay)
- ε-greedy eksploracją z liniowym/wykładniczym decay
- siecią neuronową trenowaną w przeglądarce przez TensorFlow.js
