# ANewFoe Module

## Overview

ANewFoe is a Foundry VTT module designed to enhance the mystery and discovery of monsters in your game. It hides unknown monsters from players until they are identified, providing a more immersive experience. The module allows GMs to manage monster knowledge, reveal stats, and handle bulk uploads of monster knowledge.

## Features

- **Hide Unknown Monsters**: Automatically hides monsters that players have not yet identified.
- **Reveal Monster Stats**: Allows players to reveal specific stats of monsters after identification.
- **Bulk Upload Monster Knowledge**: GMs can upload a list of monsters that players have learned about.
- **GM Approval for Stat Rolls**: GMs can approve or reject player rolls to discover monster stats.
- **Customizable DC Modifiers**: Adjust the difficulty of revealing monster stats.

## Usage

#### GM:

1. **Initialize the Module**: Ensure the module is enabled in Foundry VTT.
2. **Configure Settings**: Adjust the settings as per your campaign needs. Visualizations and stat roll characteristics can be customized independently.
3. **Hide and Reveal Monsters**: Use the new token hud button on each token to hide and reveal monsters during gameplay.
4. **Manage Stat Rolls**: Approve or reject player rolls in the GM queue window to reveal monster stats.
5. **Bulk Upload Knowledge**: Use the bulk upload feature to grant players knowledge of multiple monsters at once. (Intended for use before or after game time)

#### PLAYERS:

1. **Token Identification**: If a token is unknown it will appear with a black silhouette. You cannot perform actions on this token until you have identified it. Ask your gm to identify the monster. Once you learn the monsters identity its image will appear.
2. **After Identification**: Depending on your GM's settings, either click the book in the top right corner of the token or left click on the identified Monster to open the Monster info window.
3. **Monster Info Window**: This window displays health, ac, speed, and stats of the monster. You do not know these attributes until you have discerned them. Click on the corresponding button to send a request to your GM to discern a trait.
4. **Use your new found knowledge to slay your enemies!**

## Setup

Base settings for the module should be already set up. If you wish to prepopulate some of the known monsters in the players lists you can use the bulk upload feature in the module settings. After using the bulk upload feature a page reload is recommended. You can use the below array as a starter entry:

```
[
  "Goblin",
  "Kobold",
  "Orc",
  "Hobgoblin",
  "Bandit",
  "Bandit Captain",
  "Bugbear",
  "Gnoll",
  "Ogre",
  "Wolf",
  "Dire Wolf",
  "Worg",
  "Zombie",
  "Skeleton",
  "Ghoul",
  "Shadow",
  "Giant Spider",
  "Giant Rat",
  "Giant Frog",
  "Giant Snake",
  "Rat",
  "Blink Dog",
  "Flying Snake",
  "Quasit",
  "Imp",
  "Mimic",
  "Gelatinous Cube",
  "Ochre Jelly",
  "Gray Ooze",
  "Grick",
  "Dust Mephit",
  "Steam Mephit",
  "Mud Mephit",
  "Cockatrice",
  "Giant Scorpion",
  "Harpy",
  "Will-o'-Wisp",
  "Stirge",
  "Basilisk",
  "Animated Armor",
  "Scout",
  "Pseudodragon",
  "Pixie",
  "Sprite",
  "Myconid Sprout",
  "Flumph",
  "Giant Goat",
  "Vampiric Mist",
  "Giant Vulture",
  "Merfolk",
  "Aarakocra",
  "Banshee",
  "Giant Crab",
  "Twig Blight",
  "Commoner",
  "Guard",
  "Noble",
  "Acolyte",
  "Apprentice Wizard",
  "Cultist",
  "Cult Fanatic",
  "Thug",
  "Veteran",
  "Assassin",
  "Bandit Leader",
  "Spy",
  "Mage",
  "Knight",
  "Priest",
  "Ruffian",
  "Merchant",
  "Peasant",
  "Beggar",
  "Farmer",
  "Town Guard",
  "City Watch",
  "Dockworker",
  "Scholar",
  "Scribe",
  "Tavernkeeper",
  "Sailor",
  "Blacksmith",
  "Stablehand",
  "Hunter",
  "Fisherman",
  "Herbalist",
  "Artisan",
  "Apothecary",
  "Miner",
  "Militiaman",
  "Shepherd",
  "Griffon Hatchling",
  "Young Owlbear",
  "Young Hippogriff",
  "Baby Dragon Wyrmling",
  "Young Giant Toad",
  "Young Hydra",
  "Dire Boar",
  "Dire Bear",
  "Dire Ape",
  "Raven Swarm",
  "Bat Swarm",
  "Spider Swarm"
]
```

## Settings

### Core Display Settings

- **Auto Reveal**

  - **Name**: `autoReveal`
  - **Hint**: Choose to auto reveal tokens to your players.
  - **Type**: Boolean
  - **Default**: `false`
  - **Requires Reload**: `false`

- **Use Left Click**

  - **Name**: `useLeftClick`
  - **Hint**: Change Monster Info to pop up on left click instead of when clicking the book symbol.
  - **Type**: Boolean
  - **Default**: `false`
  - **Requires Reload**: `true`

- **Monster Hiding Style**
  - **Name**: `hideStyle`
  - **Hint**: Choose how unidentified monsters appear to players.
  - **Type**: String
  - **Choices**: `silhouette`
  - **Default**: `silhouette`
  - **Requires Reload**: `true`

### Stat Reveal Settings

- **Enable Stat Reveal**

  - **Name**: `enableStatReveal`
  - **Hint**: If enabled, players can reveal monster stats after the monster has been revealed.
  - **Type**: Boolean
  - **Default**: `true`
  - **Requires Reload**: `true`

- **Use Player Character Stats**

  - **Name**: `usePlayerStats`
  - **Hint**: If enabled, ability checks will use the player's owned character's modifiers instead of flat d20 rolls.
  - **Type**: Boolean
  - **Default**: `false`

- **DC Calculation Method**

  - **Name**: `dcCalculationMethod`
  - **Hint**: Choose how the DCs for stat checks are calculated.
  - **Type**: String
  - **Choices**: `fixedValue`, `challengeRatingScaling`
  - **Default**: `challengeRatingScaling`

- **Fixed DC Value**

  - **Name**: `fixedDCValue`
  - **Hint**: Set the fixed DC value for all stat checks when using Fixed DC method.
  - **Type**: Number
  - **Default**: `15`
  - **Range**: { min: 1, max: 30, step: 1 }

- **DC Modifiers**

  - **Name**: `dcModifiers`
  - **Type**: Object
  - **Default**: { hp: 0, ac: 0, speed: 0, str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }

- **GM DC Adjustments**
  - **Name**: `gmDCAdjustments`
  - **Type**: Object
  - **Default**: { hp: 0, ac: 0, speed: 0, str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }

### Approval Settings

- **Require GM Approval for Stat Rolls**

  - **Name**: `requireGMApproval`
  - **Hint**: If enabled, the GM must approve all player rolls to discover monster stats.
  - **Type**: Boolean
  - **Default**: `true`

- **Enable Auto-Reject**

  - **Name**: `enableAutoReject`
  - **Hint**: Automatically reject stat check requests after a specified time.
  - **Type**: Boolean
  - **Default**: `false`

- **Auto-Reject Timer (minutes)**
  - **Name**: `autoRejectTimer`
  - **Hint**: How long to wait before auto-rejecting requests (in minutes).
  - **Type**: Number
  - **Default**: `5`
  - **Range**: { min: 1, max: 60, step: 1 }

### State Persistence Settings

- **Learned Monsters**

  - **Name**: `learnedMonsters`
  - **Hint**: Monsters that players have learned about.
  - **Type**: Object
  - **Default**: {}

- **Revealed Monster Stats**

  - **Name**: `revealedStats`
  - **Hint**: Stats that have been revealed to players.
  - **Type**: Object
  - **Default**: {}

- **Monster Knowledge Details**

  - **Name**: `learnedMonsterInfo`
  - **Hint**: Detailed information about monster knowledge.
  - **Type**: Object
  - **Default**: {}

- **Pending Requests**
  - **Name**: `pendingRequests`
  - **Type**: Array
  - **Default**: []

### Window Position Settings

- **Monster Info Position**

  - **Name**: `monsterInfoPosition`
  - **Type**: Object
  - **Default**: {}

- **GM Queue Position**
  - **Name**: `gmQueuePosition`
  - **Type**: Object
  - **Default**: {}

## Menus

- **DC Modifiers Menu**

  - **Name**: `dcModifiersMenu`
  - **Label**: `Modify DC Values`
  - **Hint**: Adjust the difficulty modifiers for each stat.
  - **Icon**: `fas fa-sliders-h`
  - **Type**: `DCModifiersConfig`
  - **Restricted**: `true`

- **Bulk Upload Menu**
  - **Name**: `bulkUploadMenu`
  - **Label**: `Bulk Upload`
  - **Hint**: Upload a list of monster names to grant knowledge to a player.
  - **Icon**: `fas fa-upload`
  - **Type**: `BulkUploadConfig`
  - **Restricted**: `true`

For detailed instructions and support, refer to the module's documentation or contact the author.
