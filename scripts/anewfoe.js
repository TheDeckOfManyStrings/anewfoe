// Define RENDERED and CLOSING manually if not available in foundry.applications.ApplicationState
const RENDERED = 2;
const CLOSING = 3;

class DCModifiersConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "DC Modifiers Configuration",
      id: "dc-modifiers-config",
      template: `modules/anewfoe/templates/dc-modifiers-config.html`,
      width: 400,
      height: "auto",
      closeOnSubmit: true,
    });
  }

  getData(options) {
    const modifiers = game.settings.get("anewfoe", "dcModifiers");
    return {
      modifiers: Object.entries(modifiers).map(([key, value]) => ({
        key,
        value,
        label: key.toUpperCase(),
      })),
    };
  }

  async _updateObject(event, formData) {
    const modifiers = {};
    for (let [key, value] of Object.entries(formData)) {
      if (key.startsWith("modifier-")) {
        const stat = key.replace("modifier-", "");
        modifiers[stat] = Number(value);
      }
    }
    await game.settings.set("anewfoe", "dcModifiers", modifiers);
  }
}

// Add this new class near the top of the file, after other class definitions
class BulkUploadConfig extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      title: "Bulk Upload Monster Knowledge",
      id: "bulk-upload-config",
      template: "modules/anewfoe/templates/bulk-upload.html",
      width: 500,
      height: "auto",
      closeOnSubmit: false,
    });
  }

  getData(options) {
    return {
      players: game.users
        .filter((u) => !u.isGM)
        .map((u) => ({
          id: u.id,
          name: u.name,
        })),
    };
  }

  async _updateObject(event, formData) {
    try {
      const playerId = formData.playerId;
      let monsterList = [];

      // Handle file upload
      if (event.target.jsonFile?.files?.length > 0) {
        const file = event.target.jsonFile.files[0];
        const text = await file.text();
        monsterList = this._parseMonsterList(text);
      }
      // Handle pasted content
      else if (formData.jsonContent) {
        monsterList = this._parseMonsterList(formData.jsonContent);
      }

      if (monsterList.length === 0) {
        ui.notifications.warn("No valid monster names found in the input.");
        return;
      }

      await this._processMonsterList(playerId, monsterList);
      const user = game.users.get(playerId);
      ui.notifications.info(
        `Successfully processed ${monsterList.length} monsters for ${user.name}.`
      );
      this.close();
    } catch (error) {
      console.error(`${ANewFoe.ID} | Error processing bulk upload:`, error);
      ui.notifications.error(
        "Error processing the upload. Check the console for details."
      );
    }
  }

  _parseMonsterList(content) {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        return data.filter((name) => typeof name === "string");
      } else if (typeof data === "object") {
        return Object.entries(data)
          .filter(([_, value]) => value === true)
          .map(([key, _]) => key);
      }
      return [];
    } catch (error) {
      ui.notifications.error("Invalid JSON format");
      throw error;
    }
  }

  async _processMonsterList(playerId, monsterNames) {
    const learnedMonsters =
      game.settings.get("anewfoe", "learnedMonsters") || {};
    learnedMonsters[playerId] = learnedMonsters[playerId] || [];

    // Find matching actors
    for (const name of monsterNames) {
      const actor = game.actors.find(
        (a) => a.type === "npc" && a.name.toLowerCase() === name.toLowerCase()
      );

      if (actor && !learnedMonsters[playerId].includes(actor.id)) {
        learnedMonsters[playerId].push(actor.id);
      }
    }

    await game.settings.set("anewfoe", "learnedMonsters", learnedMonsters);
  }

  async _wipeKnownMonsters(playerId) {
    const learnedMonsters =
      game.settings.get("anewfoe", "learnedMonsters") || {};
    if (learnedMonsters[playerId]) {
      delete learnedMonsters[playerId];
      await game.settings.set("anewfoe", "learnedMonsters", learnedMonsters);
      ui.notifications.info(
        `All known monsters have been wiped for the selected player.`
      );
    } else {
      ui.notifications.warn(`The selected player has no known monsters.`);
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Clear textarea when file is selected and vice versa
    html.find('input[name="jsonFile"]').change((ev) => {
      if (ev.target.value) {
        html.find('textarea[name="jsonContent"]').val("");
      }
    });

    html.find('textarea[name="jsonContent"]').change((ev) => {
      if (ev.target.value) {
        html.find('input[name="jsonFile"]').val("");
      }
    });

    // Add listener for the wipe button
    html.find("#wipe-known-monsters").click(async (ev) => {
      const playerId = html.find('select[name="playerId"]').val();
      if (playerId) {
        await this._wipeKnownMonsters(playerId);
      } else {
        ui.notifications.warn("Please select a player to wipe known monsters.");
      }
    });
  }
}

// Import the DCModifiersConfig class
// import { DCModifiersConfig } from "./dc-modifiers-config.js";

class MonsterInfoDisplay extends Application {
  static instance = null;

  constructor(token, options = {}) {
    super(options);
    this.token = token;
    this.actor = token.actor;
    MonsterInfoDisplay.instance = this;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "monster-info-display",
      template: `modules/anewfoe/templates/monster-info.html`,
      title: "Monster Info",
      width: 240,
      height: 420,
      minimizable: true,
      resizable: true,
      dragDrop: [],
      classes: ["monster-info-window"],
      popOut: true,
    });
  }

  async getData() {
    // Get fresh data each time to ensure current state
    const revealedStats = game.settings.get(ANewFoe.ID, "revealedStats") || {};
    const actorId = this.token.document.getFlag(ANewFoe.ID, "actorId");
    const userId = game.user.id;
    const statKey = `${userId}.${actorId}`;
    const playerStats = revealedStats[statKey] || [];

    const speed = [];
    if (this.actor.system.attributes.movement.walk) {
      speed.push(`${this.actor.system.attributes.movement.walk} ft.`);
    }
    if (this.actor.system.attributes.movement.fly) {
      speed.push(`Fly ${this.actor.system.attributes.movement.fly} ft.`);
    }
    if (this.actor.system.attributes.movement.swim) {
      speed.push(`Swim ${this.actor.system.attributes.movement.swim} ft.`);
    }

    const dcValues = this._calculateDCs();

    return {
      name: this.actor.name,
      img: this.actor.img,
      stats: [
        {
          label: "Hit Points",
          value: this.actor.system.attributes.hp.value,
          key: "hp",
          revealed: playerStats.includes("hp"),
          dc: dcValues["hp"],
          totalDC:
            dcValues["hp"] +
            (game.settings.get("anewfoe", "dcModifiers").hp || 0),
        },
        {
          label: "Armor Class",
          value: this.actor.system.attributes.ac.value,
          key: "ac",
          revealed: playerStats.includes("ac"),
          dc: dcValues["ac"],
          totalDC:
            dcValues["ac"] +
            (game.settings.get("anewfoe", "dcModifiers").ac || 0),
        },
        {
          label: "Speed",
          value: speed.join(", "),
          key: "speed",
          revealed: playerStats.includes("speed"),
          dc: dcValues["speed"],
          totalDC:
            dcValues["speed"] +
            (game.settings.get("anewfoe", "dcModifiers").speed || 0),
        },
        {
          label: "Strength",
          value: `${this.actor.system.abilities.str.value} (${this._getModifier(
            this.actor.system.abilities.str.mod
          )})`,
          key: "str",
          revealed: playerStats.includes("str"),
          dc: dcValues["str"],
          totalDC:
            dcValues["str"] +
            (game.settings.get("anewfoe", "dcModifiers").str || 0),
        },
        {
          label: "Dexterity",
          value: `${this.actor.system.abilities.dex.value} (${this._getModifier(
            this.actor.system.abilities.dex.mod
          )})`,
          key: "dex",
          revealed: playerStats.includes("dex"),
          dc: dcValues["dex"],
          totalDC:
            dcValues["dex"] +
            (game.settings.get("anewfoe", "dcModifiers").dex || 0),
        },
        {
          label: "Constitution",
          value: `${this.actor.system.abilities.con.value} (${this._getModifier(
            this.actor.system.abilities.con.mod
          )})`,
          key: "con",
          revealed: playerStats.includes("con"),
          dc: dcValues["con"],
          totalDC:
            dcValues["con"] +
            (game.settings.get("anewfoe", "dcModifiers").con || 0),
        },
        {
          label: "Intelligence",
          value: `${this.actor.system.abilities.int.value} (${this._getModifier(
            this.actor.system.abilities.int.mod
          )})`,
          key: "int",
          revealed: playerStats.includes("int"),
          dc: dcValues["int"],
          totalDC:
            dcValues["int"] +
            (game.settings.get("anewfoe", "dcModifiers").int || 0),
        },
        {
          label: "Wisdom",
          value: `${this.actor.system.abilities.wis.value} (${this._getModifier(
            this.actor.system.abilities.wis.mod
          )})`,
          key: "wis",
          revealed: playerStats.includes("wis"),
          dc: dcValues["wis"],
          totalDC:
            dcValues["wis"] +
            (game.settings.get("anewfoe", "dcModifiers").wis || 0),
        },
        {
          label: "Charisma",
          value: `${this.actor.system.abilities.cha.value} (${this._getModifier(
            this.actor.system.abilities.cha.mod
          )})`,
          key: "cha",
          revealed: playerStats.includes("cha"),
          dc: dcValues["cha"],
          totalDC:
            dcValues["cha"] +
            (game.settings.get("anewfoe", "dcModifiers").cha || 0),
        },
      ],
    };
  }

  _getModifier(mod) {
    return mod >= 0 ? `+${mod}` : mod.toString();
  }

  _calculateDCs() {
    const method = game.settings.get(ANewFoe.ID, "dcCalculationMethod");
    const modifiers = game.settings.get(ANewFoe.ID, "dcModifiers");
    const defaultDCs = {
      hp: 12,
      ac: 12,
      speed: 10,
      str: 15,
      dex: 15,
      con: 15,
      int: 15,
      wis: 15,
      cha: 15,
    };
    const dcValues = {};

    switch (method) {
      case "fixedValue":
        const fixedDC = game.settings.get(ANewFoe.ID, "fixedDCValue") || 15;
        for (const key in defaultDCs) {
          dcValues[key] = Math.max(1, fixedDC + (modifiers[key] || 0));
        }
        break;
      case "challengeRatingScaling":
        const cr = this.actor.system.details.cr || 0;
        const scaledDC = this._calculateCRBasedDC(cr);
        for (const key in defaultDCs) {
          dcValues[key] = Math.max(1, scaledDC + (modifiers[key] || 0));
        }
        break;
      default:
        return defaultDCs;
    }

    // Apply GM-specific adjustments
    const gmAdjustments =
      game.settings.get(ANewFoe.ID, "gmDCAdjustments") || {};
    for (const key in dcValues) {
      if (gmAdjustments[key] !== undefined) {
        dcValues[key] += gmAdjustments[key];
      }
    }

    return dcValues;
  }

  _calculateCRBasedDC(cr) {
    // Non-linear scaling from 10 (CR 0) to 30 (CR 30)
    // Using an exponential formula for smooth scaling
    const maxCR = 30;
    const minDC = 10;
    const maxDC = 30;
    const scaledDC = minDC + (maxDC - minDC) * Math.pow(cr / maxCR, 0.5);
    return Math.round(scaledDC);
  }

  async getPlayerModifier(ability) {
    try {
      const userId = game.user.id;

      // Get the user's assigned character from their profile
      const user = game.users.get(userId);
      if (!user?.character) {
        return 0;
      }

      const modifier = user.character.system.abilities[ability].mod;

      return modifier;
    } catch (error) {
      console.error(`${ANewFoe.ID} | Error getting player modifier:`, error);
      return 0;
    }
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.find(".stat-roll").click(async (event) => {
      try {
        const button = event.currentTarget;
        const key = button.dataset.key;
        const dc = parseInt(button.dataset.dc);

        // Prevent multiple requests for the same stat
        const isPending = ANewFoe.isRequestPending(
          game.user.id,
          this.actor.id,
          key
        );
        if (isPending) {
          ui.notifications.info(
            "You have already requested this stat. Please wait for the GM's response."
          );
          return;
        }

        const usePlayerStats = game.settings.get(ANewFoe.ID, "usePlayerStats");
        const requireApproval = game.settings.get(
          ANewFoe.ID,
          "requireGMApproval"
        );

        if (requireApproval && !game.user.isGM) {
          // Send request to GM and wait for approval
          game.socket.emit(`module.${ANewFoe.ID}`, {
            type: "requestStatRoll",
            userId: game.user.id,
            actorId: this.actor.id,
            tokenId: this.token.id,
            key: key,
            dc: dc,
            usePlayerStats: usePlayerStats,
          });
          // Mark request as pending after sending to GM
          ANewFoe.addPendingRequest(game.user.id, this.actor.id, key);
          ui.notifications.info(
            "Your request to discover the stat has been sent to the GM for approval."
          );
          return;
        }

        // If no approval needed or is GM, process roll immediately
        await this.processApprovedStatRoll({
          key: key,
          dc: dc,
          usePlayerStats: usePlayerStats,
          actorId: this.actor.id,
        });
      } catch (error) {
        console.error(`${ANewFoe.ID} | Error in stat roll:`, error);
      }
    });
  }

  static isAbilityCheck(key) {
    const isAbility = ["str", "dex", "con", "int", "wis", "cha"].includes(key);
    return isAbility;
  }

  async refresh() {
    await this.render(true);
  }

  setPosition(options = {}) {
    // Get saved position from settings
    const savedPosition = game.settings.get(ANewFoe.ID, "monsterInfoPosition");
    if (savedPosition) {
      options = foundry.utils.mergeObject(savedPosition, options);
    }

    // Call parent class setPosition
    return super.setPosition(options);
  }

  async close(options = {}) {
    // Save the current position before closing
    if (this.position) {
      await game.settings.set(ANewFoe.ID, "monsterInfoPosition", this.position);
    }

    // Clear the instance reference before closing
    if (MonsterInfoDisplay.instance === this) {
      MonsterInfoDisplay.instance = null;
    }

    return super.close(options);
  }

  async _render(force = false, options = {}) {
    await super._render(force, options);
    this.setPosition();
  }

  async processApprovedStatRoll(data) {
    try {
      const key = data.key;
      const dc = parseInt(data.dc);
      const usePlayerStats = data.usePlayerStats;
      const actorId = data.actorId;

      // Remove the pending request after processing the roll
      ANewFoe.removePendingRequest(game.user.id, actorId, key);

      let rollFormula = "1d20";
      let modifier = 0;

      if (usePlayerStats && MonsterInfoDisplay.isAbilityCheck(key)) {
        const character = game.user.character;
        if (character) {
          modifier = character.system.abilities[key].mod;
          rollFormula += modifier >= 0 ? `+${modifier}` : modifier;
        }
      }

      // Create and evaluate roll
      const roll = new Roll(rollFormula);
      await roll.evaluate();

      const total = roll.total;

      // Send chat message for the roll
      await ChatMessage.create({
        flavor: `Attempting to discern ${key.toUpperCase()}...`,
        speaker: ChatMessage.getSpeaker(),
        rolls: [roll],
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        sound: CONFIG.sounds.dice,
      });

      if (total >= dc) {
        // Send message to GM to reveal the stat
        game.socket.emit(`module.${ANewFoe.ID}`, {
          type: "revealStat",
          userId: game.user.id,
          actorId: this.actor.id,
          key: key,
        });
      } else {
        ui.notifications.info("The check failed to reveal the stat.");
      }
    } catch (error) {
      ui.notifications.error("There was an error processing the roll.");
    }
  }
}

class ANewFoe {
  static ID = "anewfoe";

  static FLAGS = {
    REVEALED: "revealed",
    REVEALED_TO: "revealedTo",
  };

  static TEMPLATES = {
    REVEAL_DIALOG: `modules/${this.ID}/templates/reveal-dialog.html`,
  };

  static DEFAULT_ICON = "icons/svg/mystery-man.svg";

  static OPERATIONS = {
    PROCESSING_VISIBILITY: false,
  };

  static DEBOUNCE = {
    lastReveal: {},
    lastChat: {},
    TIMEOUT: 200,
  };

  static PENDING_REQUESTS = [];

  // Add new properties after other static properties
  static TIMEOUTS = new Map();

  static initialize() {
    this.registerSettings();
    this.registerHooks();
    this.setupSocket();

    // Load pending requests from settings
    this.loadPendingRequests();

    // If player, check with GM for pending requests
    if (!game.user.isGM) {
      this.syncPendingRequestsWithGM();
    }

    // Create GM UI immediately if user is GM and stat reveal is enabled
    if (game.user.isGM && game.settings.get(this.ID, "enableStatReveal")) {
      this.createGMApprovalUI();
      this.updateGMApprovalUI(); // Add this line to populate the UI on initialization
    }
  }

  static syncPendingRequestsWithGM() {
    // Add a slight delay to ensure socket is ready
    setTimeout(() => {
      game.socket.emit(`module.${this.ID}`, {
        type: "requestPendingSync",
        userId: game.user.id,
      });
    }, 500);
  }

  static loadPendingRequests() {
    const storedRequests = game.settings.get(this.ID, "pendingRequests") || [];
    this.PENDING_REQUESTS = storedRequests;
    this.updateGMApprovalUI();
  }

  static savePendingRequests() {
    if (game.user.isGM) {
      game.settings.set(this.ID, "pendingRequests", this.PENDING_REQUESTS);
    }
  }

  static setupSocket() {
    const socketName = `module.${this.ID}`;

    // Remove any existing listeners to prevent duplicates
    game.socket.off(socketName); // Ensure old listeners are removed

    game.socket.on(socketName, async (data, ack) => {
      await this.handleSocketMessage(data);
      if (ack && typeof ack === "function") ack({ received: true });
    });
  }

  static async handleSocketMessage(data) {
    try {
      const messageKey = `${data.userId}-${data.key}-${data.actorId}`;
      const now = Date.now();

      switch (data.type) {
        case "revealStat":
          if (game.user.isGM) {
            await this.handleStatReveal(data);
          }
          break;
        case "statRevealed":
          if (
            data.userId === game.user.id &&
            (!this.DEBOUNCE.lastReveal[messageKey] ||
              now - this.DEBOUNCE.lastReveal[messageKey] >
                this.DEBOUNCE.TIMEOUT)
          ) {
            await this.handleStatRevealed(data);
          }
          break;
        case "setTokenFlags":
          if (game.user.isGM) {
            await this.handleSetTokenFlags(data);
          }
          break;
        case "refreshScene":
          if (data.playerIds.includes(game.user.id)) {
            await canvas.draw();
            await canvas.perception.initialize();
            await canvas.tokens.draw();
          }
          break;
        case "requestStatRoll":
          if (game.user.isGM) {
            await this.handleStatRollRequest(data);
          }
          break;
        case "statRollApproved":
          if (game.user.id === data.userId) {
            // Process the roll directly instead of requiring display instance
            await this.processStatRoll(data);
          }
          break;
        case "processApprovedStatRoll":
          if (game.user.id === data.userId) {
            const display = MonsterInfoDisplay.instance;
            if (display) {
              await display.processApprovedStatRoll(data);
            }
          }
          break;
        case "statRollRejected":
          if (game.user.id === data.userId) {
            // Remove the pending request when rejected
            ANewFoe.removePendingRequest(data.userId, data.actorId, data.key);
            ui.notifications.info("Your request was rejected by the GM.");
          }
          if (game.user.isGM) {
            // Remove pending request and update UI
            this.removePendingRequest(data.userId, data.actorId, data.key);
          }
          break;
        case "addPendingRequest":
          if (game.user.isGM) {
            this.addPendingRequest(data.userId, data.actorId, data.statKey);
          }
          break;
        case "removePendingRequest":
          if (game.user.isGM) {
            this.removePendingRequest(data.userId, data.actorId, data.statKey);
          }
          break;
        case "requestPendingSync":
          if (game.user.isGM) {
            const playerRequests = this.PENDING_REQUESTS.filter(
              (req) => req.userId === data.userId
            );
            if (playerRequests.length > 0) {
              game.socket.emit(`module.${this.ID}`, {
                type: "pendingRequestsSync",
                userId: data.userId,
                requests: playerRequests,
              });
            }
          }
          break;

        case "pendingRequestsSync":
          if (game.user.id === data.userId && data.requests) {
            // Only update requests for the current player
            this.PENDING_REQUESTS = data.requests.filter(
              (req) => req.userId === game.user.id
            );

            // If we have any pending requests, update the display
            if (MonsterInfoDisplay.instance) {
              await MonsterInfoDisplay.instance.refresh();
            }
          }
          break;
        case "monsterRevealed":
          if (game.user.id === data.userId) {
            // Update learned monsters if revealed
            if (data.isRevealed) {
              const learnedMonsters =
                game.settings.get(this.ID, "learnedMonsters") || {};
              learnedMonsters[game.user.id] =
                learnedMonsters[game.user.id] || [];
              if (!learnedMonsters[game.user.id].includes(data.actorId)) {
                learnedMonsters[game.user.id].push(data.actorId);
                await game.settings.set(
                  this.ID,
                  "learnedMonsters",
                  learnedMonsters
                );
              }
            }

            // Refresh affected tokens
            for (const tokenId of data.tokenIds) {
              const token = canvas.tokens.get(tokenId);
              if (token) {
                if (data.isRevealed) {
                  await this._restoreTokenAppearance(token);
                  this._makeTokenClickable(token);
                } else {
                  await this._processTokenVisibility(token);
                }
              }
            }

            // Refresh any open monster info display
            if (MonsterInfoDisplay.instance) {
              await MonsterInfoDisplay.instance.refresh();
            }
          }
          break;
      }
    } catch (error) {
      console.error(`${this.ID} | Error handling socket message:`, error);
    }
  }

  static async handleSetTokenFlags(data) {
    if (!game.user.isGM) return;

    try {
      const token = canvas.tokens.get(data.tokenId);
      if (!token) return;
      // Remove references to REVEALED_TO and rely on learnedMonsters
      await ANewFoe.learnMonsterType(token.document, data.userId);
    } catch (error) {
      console.error(`${this.ID} | Error setting token flags:`, error);
    }
  }

  static async handleStatRevealed(data) {
    try {
      const messageKey = `${data.userId}-${data.key}-${data.actorId}`;
      const now = Date.now();

      // Check if we've handled this message recently
      if (
        this.DEBOUNCE.lastReveal[messageKey] &&
        now - this.DEBOUNCE.lastReveal[messageKey] < this.DEBOUNCE.TIMEOUT
      ) {
        return;
      }

      this.DEBOUNCE.lastReveal[messageKey] = now;

      if (MonsterInfoDisplay.instance) {
        await MonsterInfoDisplay.instance.refresh();
      }
    } catch (error) {
      console.error(`${this.ID} | Error handling stat revealed:`, error);
    }
  }

  static async handleStatReveal(data) {
    if (!game.user.isGM) return;

    try {
      const revealedStats = game.settings.get(this.ID, "revealedStats") || {};
      const statKey = `${data.userId}.${data.actorId}`;

      if (!revealedStats[statKey]) {
        revealedStats[statKey] = [];
      }

      if (!revealedStats[statKey].includes(data.key)) {
        revealedStats[statKey].push(data.key);
        await game.settings.set(this.ID, "revealedStats", revealedStats);

        // Send confirmation back to player
        game.socket.emit(`module.${this.ID}`, {
          type: "statRevealed",
          userId: data.userId,
          key: data.key,
          actorId: data.actorId,
        });
      }
    } catch (error) {
      console.error(`${this.ID} | Error in stat reveal:`, error);
    }
  }

  static async handleStatRollRequest(data) {
    if (!game.user.isGM) return;

    // Ensure GM UI exists and is rendered
    if (!GMQueueApplication.instance) {
      this.createGMApprovalUI();
    } else if (GMQueueApplication.instance._state !== RENDERED) {
      GMQueueApplication.instance.render(true);
    }

    const user = game.users.get(data.userId);
    const actor = game.actors.get(data.actorId);
    const key = data.key;
    const dc = data.dc;
    const usePlayerStats = data.usePlayerStats;
    const tokenId = data.tokenId;

    // Add the request to the pending list with all needed data
    this.PENDING_REQUESTS.push({
      userId: data.userId,
      actorId: data.actorId,
      statKey: data.key,
      tokenId: data.tokenId,
      dc: data.dc,
      usePlayerStats: data.usePlayerStats,
    });

    // Save pending requests
    this.savePendingRequests();

    // Update the queue UI
    this.updateGMApprovalUI();

    // Show the GM queue window if it was closed
    if (!GMQueueApplication.instance) {
      this.createGMApprovalUI();
    }

    // Set up auto-reject timer if enabled
    if (game.settings.get(this.ID, "enableAutoReject")) {
      const timeoutMinutes = game.settings.get(this.ID, "autoRejectTimer");
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const timeoutKey = `${data.userId}-${data.actorId}-${data.key}`;

      // Clear any existing timeout for this request
      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
      }

      // Set new timeout
      const timeout = setTimeout(() => {
        // Check if request still exists before auto-rejecting
        if (
          this.PENDING_REQUESTS.some(
            (req) =>
              req.userId === data.userId &&
              req.actorId === data.actorId &&
              req.statKey === data.key
          )
        ) {
          this.handleRejection({
            userId: data.userId,
            actorId: data.actorId,
            statKey: data.key,
            tokenId: data.tokenId,
          });
          this.TIMEOUTS.delete(timeoutKey);
        }
      }, timeoutMs);

      this.TIMEOUTS.set(timeoutKey, timeout);
    }
  }

  static async handleStatRollApproved(data) {
    if (game.user.id !== data.userId) return;
    const display = MonsterInfoDisplay.instance;
    if (display) {
      // Proceed with the roll
      await display.processApprovedStatRoll(data);
    }
  }

  static async handleStatRollRejected(data) {
    if (game.user.id !== data.userId) return;
    const display = MonsterInfoDisplay.instance;
    if (display) {
      // Remove the pending request when rejected
      ANewFoe.removePendingRequest(data.userId, display.actor.id, data.key);
      ui.notifications.info("Your request was rejected by the GM.");
    }
  }

  static addPendingRequest(userId, actorId, statKey) {
    if (game.user.isGM) {
      // Prevent duplicate requests
      const exists = this.PENDING_REQUESTS.some(
        (req) =>
          req.userId === userId &&
          req.actorId === actorId &&
          req.statKey === statKey
      );
      if (!exists) {
        this.PENDING_REQUESTS.push({ userId, actorId, statKey });
        this.savePendingRequests();
        this.updateGMApprovalUI();

        // Notify the specific player about their pending request
        game.socket.emit(`module.${this.ID}`, {
          type: "pendingRequestsSync",
          userId: userId,
          requests: this.PENDING_REQUESTS.filter(
            (req) => req.userId === userId
          ),
        });
      }
    } else {
      // Player sends a socket message to GM to add the pending request
      game.socket.emit(`module.${this.ID}`, {
        type: "addPendingRequest",
        userId,
        actorId,
        statKey,
      });
    }
  }

  static removePendingRequest(userId, actorId, statKey) {
    if (game.user.isGM) {
      // Clear auto-reject timeout if it exists
      const timeoutKey = `${userId}-${actorId}-${statKey}`;
      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
        this.TIMEOUTS.delete(timeoutKey);
      }

      // Remove the request and update the UI
      const initialLength = this.PENDING_REQUESTS.length;
      this.PENDING_REQUESTS = this.PENDING_REQUESTS.filter(
        (req) =>
          !(
            req.userId === userId &&
            req.actorId === actorId &&
            req.statKey === statKey
          )
      );

      if (this.PENDING_REQUESTS.length !== initialLength) {
        this.savePendingRequests();
        this.updateGMApprovalUI();
      }
    } else {
      // Player sends a socket message to GM to remove the pending request
      game.socket.emit(`module.${this.ID}`, {
        type: "removePendingRequest",
        userId,
        actorId,
        statKey,
      });
    }
  }

  static isRequestPending(userId, actorId, statKey) {
    // Players read the pending requests from settings
    const pendingRequests = game.settings.get(this.ID, "pendingRequests") || [];

    return pendingRequests.some(
      (req) =>
        req.userId === userId &&
        req.actorId === actorId &&
        req.statKey === statKey
    );
  }

  static createGMApprovalUI() {
    if (!game.user.isGM || GMQueueApplication.instance) return;

    const queue = new GMQueueApplication();
    queue.render(true);
  }

  static updateGMApprovalUI() {
    if (!game.user.isGM) return;

    if (!GMQueueApplication.instance) {
      this.createGMApprovalUI();
    } else {
      GMQueueApplication.instance.render();
    }
  }

  static registerSettings() {
    // Core display settings
    game.settings.register(this.ID, "hideStyle", {
      name: "Monster Hiding Style",
      hint: "Choose how unidentified monsters appear to players",
      type: String,
      choices: {
        silhouette: "Black silhouette",
      },
      default: "silhouette",
      config: true,
      scope: "world",
      requiresReload: true,
    });

    // Add new setting to control stat reveal feature
    game.settings.register(this.ID, "enableStatReveal", {
      name: "Enable Stat Reveal",
      hint: "If enabled, players can reveal monster stats after the monster has been revealed.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
      onChange: (value) => {
        if (game.user.isGM) {
          if (value) {
            ANewFoe.createGMApprovalUI();
          } else if (GMQueueApplication.instance) {
            GMQueueApplication.instance.close();
          }
        }
      },
      requiresReload: true,
    });

    // State persistence settings
    game.settings.register(this.ID, "learnedMonsters", {
      name: "Learned Monsters",
      hint: "Monsters that players have learned about",
      scope: "world",
      config: false,
      type: Object,
      default: {},
    });

    game.settings.register(this.ID, "revealedStats", {
      name: "Revealed Monster Stats",
      hint: "Stats that have been revealed to players",
      scope: "world",
      config: false,
      type: Object,
      default: {},
    });

    // Additional metadata settings
    game.settings.register(this.ID, "learnedMonsterInfo", {
      name: "Monster Knowledge Details",
      hint: "Detailed information about monster knowledge",
      scope: "world",
      config: false,
      type: Object,
      default: {},
    });

    game.settings.register(this.ID, "infoDisplayPosition", {
      scope: "client",
      config: false,
      type: Object,
      default: {},
    });

    game.settings.register(this.ID, "usePlayerStats", {
      name: "Use Player Character Stats",
      hint: "If enabled, ability checks will use the player's owned character's modifiers instead of flat d20 rolls",
      type: Boolean,
      default: false,
      config: true,
      scope: "world",
    });

    game.settings.register(this.ID, "dcModifiers", {
      name: "DC Modifiers",
      scope: "world",
      config: false,
      type: Object,
      default: {
        hp: 0,
        ac: 0,
        speed: 0,
        str: 0,
        dex: 0,
        con: 0,
        int: 0,
        wis: 0,
        cha: 0,
      },
    });

    game.settings.register(this.ID, "dcCalculationMethod", {
      name: "DC Calculation Method",
      hint: "Choose how the DCs for stat checks are calculated.",
      scope: "world",
      type: String,
      choices: {
        fixedValue: "Fixed DC",
        challengeRatingScaling: "Scaling DC based on Challenge Rating",
      },
      default: "challengeRatingScaling",
      config: true,
    });

    // Register the submenu
    game.settings.registerMenu(this.ID, "dcModifiersMenu", {
      name: "DC Modifiers",
      label: "Modify DC Values",
      hint: "Adjust the difficulty modifiers for each stat",
      icon: "fas fa-sliders-h",
      type: DCModifiersConfig,
      restricted: true,
    });

    // If "fixedValue" is selected, provide an input for the fixed DC
    game.settings.register(this.ID, "fixedDCValue", {
      name: "Fixed DC Value",
      hint: "Set the fixed DC value for all stat checks when using Fixed DC method.",
      scope: "world",
      config: true,
      type: Number,
      default: 15,
      range: { min: 1, max: 30, step: 1 },
    });

    game.settings.register(this.ID, "requireGMApproval", {
      name: "Require GM Approval for Stat Rolls",
      hint: "If enabled, the GM must approve all player rolls to discover monster stats.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });

    // Register setting to store pending requests
    game.settings.register(this.ID, "pendingRequests", {
      name: "Pending Requests",
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });

    // Add new settings for auto-reject
    game.settings.register(this.ID, "enableAutoReject", {
      name: "Enable Auto-Reject",
      hint: "Automatically reject stat check requests after a specified time",
      type: Boolean,
      default: false,
      config: true,
      scope: "world",
    });

    game.settings.register(this.ID, "autoRejectTimer", {
      name: "Auto-Reject Timer (minutes)",
      hint: "How long to wait before auto-rejecting requests (in minutes)",
      type: Number,
      default: 5,
      range: {
        min: 1,
        max: 60,
        step: 1,
      },
      config: true,
      scope: "world",
    });

    game.settings.register(this.ID, "gmDCAdjustments", {
      name: "GM DC Adjustments",
      scope: "world",
      config: false,
      type: Object,
      default: {
        hp: 0,
        ac: 0,
        speed: 0,
        str: 0,
        dex: 0,
        con: 0,
        int: 0,
        wis: 0,
        cha: 0,
      },
    });

    // Add the bulk upload menu
    game.settings.registerMenu(this.ID, "bulkUploadMenu", {
      name: "Bulk Upload Monster Knowledge",
      label: "Bulk Upload",
      hint: "Upload a list of monster names to grant knowledge to a player",
      icon: "fas fa-upload",
      type: BulkUploadConfig,
      restricted: true,
    });

    // Add new settings for window positions
    game.settings.register(this.ID, "monsterInfoPosition", {
      scope: "client",
      config: false,
      type: Object,
      default: {},
    });

    game.settings.register(this.ID, "gmQueuePosition", {
      scope: "client",
      config: false,
      type: Object,
      default: {},
    });

    game.settings.register(this.ID, "sendPlayerChat", {
      name: "Send Player Chat Messages",
      hint: "If disabled, players won't receive chat messages for reveal/hide events.",
      scope: "world",
      config: true,
      type: Boolean,
      default: true,
    });
  }

  static registerHooks() {
    // Store original data when GM creates token
    Hooks.on("preCreateToken", (document, data, options, userId) => {
      if (game.user.isGM) {
        const originalData = {
          "flags.anewfoe.originalImage": data.texture.src,
          "flags.anewfoe.originalName": data.name,
          "flags.anewfoe.actorId": data.actorId,
          "flags.anewfoe.originalTint": data.texture.tint || null,
          "flags.anewfoe.originalAlpha": data.alpha || null,
        };
        document.updateSource(originalData);
      }
    });

    // Process new tokens
    Hooks.on("createToken", async (document, options, userId) => {
      if (!game.user.isGM) {
        const token = document.object;
        const actorId = document.getFlag(this.ID, "actorId");

        // Check if this monster type is already learned
        const learnedMonsters =
          game.settings.get(this.ID, "learnedMonsters") || {};
        const isLearned = learnedMonsters[game.user.id]?.includes(actorId);

        if (isLearned) {
          // Request GM to set flags instead of setting them directly
          game.socket.emit(`module.${this.ID}`, {
            type: "setTokenFlags",
            tokenId: token.id,
            userId: game.user.id,
          });
        }

        if (
          ANewFoe.isMonsterTypeKnown(document) ||
          ANewFoe.isMonsterRevealed(document)
        ) {
          ANewFoe._makeTokenClickable(token);
        } else {
          ANewFoe._processTokenVisibility(token);
        }
      }
    });

    // Handle canvas ready
    Hooks.on("canvasReady", async () => {
      // Add a small delay to ensure all tokens are fully loaded
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Process all tokens in the scene
      for (const token of canvas.tokens.placeables) {
        try {
          if (
            !token.document?.flags ||
            !token.document.getFlag(this.ID, "actorId")
          ) {
            continue;
          }

          const isKnown = this.isMonsterTypeKnown(token.document);
          const isRevealed = this.isMonsterRevealed(token.document);

          // Ensure token is properly initialized
          if (!token.mesh || !token.mesh.texture) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }

          if (game.user.isGM) {
            await this.updateTokenOverlay(token);
          } else {
            if (isKnown || isRevealed) {
              await this._restoreTokenAppearance(token);
              this._makeTokenClickable(token);
            } else if (token.mesh && token.mesh.texture) {
              await this._processTokenVisibility(token);
            }
          }
        } catch (error) {
          console.error(
            `${this.ID} | Error processing token on canvas ready:`,
            error
          );
        }
      }

      // Force a canvas update to ensure all changes are applied
      canvas.tokens.render();
    });

    // Add a new hook for scene loading
    Hooks.on("preLoadScene", (scene, data) => {
      // Clear any existing operations flag to ensure fresh processing
      this.OPERATIONS.PROCESSING_VISIBILITY = false;
    });

    // Handle refreshToken
    Hooks.on("refreshToken", async (token) => {
      if (!game.user.isGM) {
        if (
          !token.document?.flags ||
          !token.document.getFlag(this.ID, "actorId")
        ) {
          return;
        }

        const isKnown = ANewFoe.isMonsterTypeKnown(token.document);
        const isRevealed = ANewFoe.isMonsterRevealed(token.document);

        if (isKnown || isRevealed) {
          ANewFoe._makeTokenClickable(token);
        } else if (!token.document.hidden) {
          // Apply silhouette effect immediately
          if (token.mesh) {
            token.mesh.tint = 0x000000;
            token.mesh.alpha = 1;
          }
          // Restore token visibility
          token.alpha = 1;
        }
      } else if (token?.document?.flags) {
        // Ensure GM overlays are maintained
        setTimeout(() => {
          this.updateTokenOverlay(token);
        }, 100);
      }
    });

    // Enhance the updateToken hook
    Hooks.on("updateToken", async (document, changes, options, userId) => {
      const token = document.object;
      if (!game.user.isGM && token) {
        // Check if this update includes a hidden state change
        if (changes.hasOwnProperty("hidden")) {
          const isKnown = ANewFoe.isMonsterTypeKnown(document);
          const isRevealed = ANewFoe.isMonsterRevealed(document);

          if (!isKnown && !isRevealed) {
            // Only process if token is becoming visible
            if (!changes.hidden) {
              await ANewFoe._processTokenVisibility(token);
            }
          }
        }

        if (
          ANewFoe.isMonsterTypeKnown(document) ||
          ANewFoe.isMonsterRevealed(document)
        ) {
          ANewFoe._makeTokenClickable(token);
        }
      } else if (game.user.isGM) {
        ANewFoe.updateTokenOverlay(token);
      }
    });

    // Draw overlays for GM
    Hooks.on("drawToken", (token) => {
      if (game.user.isGM) {
        setTimeout(() => ANewFoe.updateTokenOverlay(token), 100);
      }
    });

    // Token updates
    Hooks.on("updateToken", (document, changes, options, userId) => {
      const token = document.object;
      if (!game.user.isGM && token) {
        // Check if this update includes a hidden state change
        if (changes.hasOwnProperty("hidden")) {
          const isKnown = ANewFoe.isMonsterTypeKnown(document);
          const isRevealed = ANewFoe.isMonsterRevealed(document);

          if (!isKnown && !isRevealed) {
            // If token becomes visible, ensure silhouette is applied
            if (!changes.hidden) {
              ANewFoe._processTokenVisibility(token);
            }
          }
        }

        if (
          ANewFoe.isMonsterTypeKnown(document) ||
          ANewFoe.isMonsterRevealed(document)
        ) {
          ANewFoe._makeTokenClickable(token);
        }
      } else if (game.user.isGM) {
        ANewFoe.updateTokenOverlay(token);
      }
    });

    Hooks.once("ready", () => {
      if (game.user.isGM && game.settings.get(this.ID, "enableStatReveal")) {
        this.createGMApprovalUI();
      }
    });

    // Add new hook to catch transitions
    Hooks.on("preUpdateToken", (document, changes, options, userId) => {
      if (!game.user.isGM && changes.hidden === false) {
        const token = document.object;
        if (
          token &&
          !ANewFoe.isMonsterTypeKnown(document) &&
          !ANewFoe.isMonsterRevealed(document)
        ) {
          // Cancel any existing transition
          if (token._alphaTransition) {
            token._alphaTransition.cancel();
            token._alphaTransition = null;
          }
        }
      }
    });

    // Add or modify preUpdateToken hook
    Hooks.on("preUpdateToken", (document, changes, options, userId) => {
      if (!game.user.isGM && changes.hidden === false) {
        const token = document.object;
        if (
          token &&
          !ANewFoe.isMonsterTypeKnown(document) &&
          !ANewFoe.isMonsterRevealed(document)
        ) {
          // Override the animation temporarily
          const originalTransition = token._animateVisibility;
          token._animateVisibility = () => {
            token.alpha = 1;
            return Promise.resolve(true);
          };

          // Restore after a short delay
          setTimeout(() => {
            token._animateVisibility = originalTransition;
          }, 100);
        }
      }
    });

    // Add this new hook at the very beginning of visibility changes
    Hooks.on(
      "preUpdateToken",
      (document, changes, options, userId) => {
        if (!game.user.isGM && changes.hidden === false) {
          const token = document.object;
          if (
            token &&
            !ANewFoe.isMonsterTypeKnown(document) &&
            !ANewFoe.isMonsterRevealed(document)
          ) {
            // Block standard visibility animation
            if (token._animation) token._animation.kill();
            if (token._alphaTransition) token._alphaTransition.kill();

            // Apply silhouette effect immediately
            if (token.mesh) {
              token.mesh.tint = 0x000000;
              token.mesh.alpha = 1;
            }

            // Force immediate full visibility
            token.alpha = 1;
            if (token.mesh) token.mesh.alpha = 1;

            // Prevent default animation
            options.animation = false;
          }
        }
      },
      { priority: 100 }
    ); // High priority to run before other hooks

    Hooks.on("canvasReady", () => {
      if (game.user.isGM) {
        if (!this.gmApprovalUI) {
          this.createGMApprovalUI();
        }
      }
    });

    // Clean up when the game closes
    Hooks.on("closeApplication", () => {
      if (this.gmApprovalUI) {
        this.gmApprovalUI.remove();
        this.gmApprovalUI = null;
      }
    });

    // Modify the Token HUD to handle multiple selected tokens
    Hooks.on("renderTokenHUD", (app, html, data) => {
      if (game.user.isGM) {
        const button = $(`<div class="control-icon anewfoe-reveal">
          <img src="icons/svg/eye.svg" title="Reveal Monster" width="36" height="36">
        </div>`);
        button.on("click", async () => {
          const selectedTokens =
            canvas.tokens.controlled.length > 0
              ? canvas.tokens.controlled
              : [app.object];
          if (selectedTokens.length === 0) {
            ui.notifications.warn("No tokens selected.");
            return;
          }
          await ANewFoe.showRevealDialog(selectedTokens);
        });
        html.find(".col.left").append(button);
      }
    });
  }

  static _makeTokenClickable(token) {
    try {
      if (!token || !token.actor) {
        return;
      }

      // Enable interaction
      token.interactive = true;
      token.buttonMode = true;

      // Set up click handling
      if (token.mouseInteractionManager) {
        // Replace the entire click handler setup with this:
        token.mouseInteractionManager.permissions.clickLeft = true;
        token.mouseInteractionManager.callbacks.clickLeft = async (event) => {
          try {
            // Prevent the default token click behavior
            event.preventDefault();
            event.stopPropagation();

            const userId = game.user.id;
            // Add null check for actor
            if (!token.actor) {
              console.warn(
                `${this.ID} | Actor not available for token:`,
                token.name
              );
              return;
            }

            const userPermissionLevel = token.actor.getUserLevel(userId);

            // Only show token HUD if user is owner
            if (userPermissionLevel >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
              return token._onClickLeft(event);
            }

            // For all other permission levels, show our custom UI if revealed
            if (ANewFoe.isMonsterRevealed(token.document)) {
              if (game.settings.get(ANewFoe.ID, "enableStatReveal")) {
                await ANewFoe.showTokenInfo(token);
              }
            }
          } catch (error) {
            console.error(`${this.ID} | Error in click handler:`, error);
          }
        };

        // Block other interactions for non-owners
        if (
          token.actor &&
          token.actor.getUserLevel(game.user.id) <
            CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER
        ) {
          token.mouseInteractionManager.permissions.clickLeft2 = false;
          token.mouseInteractionManager.permissions.clickRight = false;
          token.mouseInteractionManager.permissions.dragLeft = false;
          token.mouseInteractionManager.permissions.dragRight = false;
        }
      }

      // Add event listener for double right-click to target the token
      token.on("rightdown", (event) => {
        if (event.data.originalEvent.detail === 2) {
          token.setTarget(!token.isTargeted, { releaseOthers: false });
        }
      });
    } catch (error) {
      console.error(`${this.ID} | Error making token clickable:`, error);
    }
  }

  static async showTokenInfo(token) {
    if (!ANewFoe.isMonsterRevealed(token.document)) {
      return;
    }

    try {
      // If instance exists but is closing, wait for it to finish
      if (MonsterInfoDisplay.instance?._state === CLOSING) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // If same window exists and is rendered, bring to front
      if (
        MonsterInfoDisplay.instance?.token.id === token.id &&
        MonsterInfoDisplay.instance._state === RENDERED
      ) {
        MonsterInfoDisplay.instance.bringToTop();
        return;
      }

      // Close any existing window
      if (MonsterInfoDisplay.instance) {
        await MonsterInfoDisplay.instance.close();
        MonsterInfoDisplay.instance = null;
      }

      // Create and render new window
      const display = new MonsterInfoDisplay(token);
      await display.render(true);
    } catch (error) {
      console.error(`${this.ID} | Error showing token info:`, error);
    }
  }

  static _createSimpleSilhouette(token) {
    // Remove any existing overlay
    ANewFoe._removeBlackOverlay(token);

    // Create simple black background
    const background = new PIXI.Graphics();
    background.beginFill(0x000000, 1);
    background.drawRect(0, 0, token.w, token.h);
    background.endFill();
    background.zIndex = 999;

    token.addChild(background);
    token.blackOverlay = background;
  }

  static _createAnimatedOverlay(token) {
    // Remove any existing overlay first
    ANewFoe._removeBlackOverlay(token);

    // Create container for overlay elements
    const container = new PIXI.Container();
    container.zIndex = 999;

    // Create black background
    const background = new PIXI.Graphics();
    background.beginFill(0x000000, 1);
    background.drawRect(0, 0, token.w, token.h);
    background.endFill();
    container.addChild(background);

    // Create question mark text with enhanced visibility
    const questionMark = new PIXI.Text("?", {
      fontFamily: "Arial",
      fontSize: Math.min(token.w, token.h) * 0.8,
      fill: 0xffffff,
      align: "center",
      fontWeight: "bold",
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowDistance: 2,
      dropShadowAngle: Math.PI / 4,
      dropShadowBlur: 4,
    });

    questionMark.anchor.set(0.5);
    questionMark.position.set(token.w / 2, token.h / 2);
    container.addChild(questionMark);

    // Enhanced animation
    let animationFrame;
    const animate = () => {
      const time = Date.now() / 500;
      const scaleChange = Math.sin(time) * 0.25;
      questionMark.scale.set(1 + scaleChange);
      questionMark.rotation = Math.sin(time) * 0.2;
      questionMark.style.dropShadowDistance = 2 + Math.sin(time) * 2;
      questionMark.style.dropShadowBlur = 4 + Math.sin(time * 2) * 2;
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    container.animationFrame = animationFrame;
    token.addChild(container);
    token.blackOverlay = container;
  }

  static async _removeBlackOverlay(token) {
    if (token.blackOverlay) {
      // Cancel animation frame if it exists
      if (token.blackOverlay.animationFrame) {
        cancelAnimationFrame(token.blackOverlay.animationFrame);
      }
      token.blackOverlay.destroy({ children: true });
      token.blackOverlay = null;
    }
  }

  static async _processTokenVisibility(token) {
    if (!token || !token.document) {
      console.warn(`${this.ID} | Invalid token for visibility processing`);
      return;
    }

    if (this.OPERATIONS.PROCESSING_VISIBILITY) {
      return;
    }

    this.OPERATIONS.PROCESSING_VISIBILITY = true;

    try {
      if (!token.document.hidden) {
        // Ensure token is initialized
        if (!token.mesh || !token.mesh.texture) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        // Only proceed if the token is still valid
        if (!token.mesh || !token.mesh.texture) {
          console.warn(
            `${this.ID} | Token mesh not available, skipping visibility processing`
          );
          return;
        }

        // Force token to be visible first
        token.visible = true;
        token.alpha = 1;

        // Apply silhouette effect
        token.mesh.tint = 0x000000;
        token.mesh.alpha = 1;

        // Update text display if available
        if (token.text) {
          token.text.text = "Unknown Creature";
          token.text.visible = true;
          token.text.alpha = 1;
          await token.text.draw();
        }

        // Ensure non-interactive for players
        if (!game.user.isGM) {
          token.interactive = false;
          token.buttonMode = false;
        }

        // Force token refresh safely
        if (token.mesh && token.mesh.texture) {
          await token.refresh();
        }
      }
    } catch (error) {
      console.error(`${this.ID} | Error processing token visibility:`, error);
      // Ensure token is visible in case of error
      if (token) {
        token.alpha = 1;
        token.visible = true;
      }
    } finally {
      this.OPERATIONS.PROCESSING_VISIBILITY = false;
    }
  }

  static async _restoreTokenAppearance(token) {
    try {
      const originalTint = token.document.getFlag(this.ID, "originalTint");
      const originalName = token.document.getFlag(this.ID, "originalName");

      token.document.texture.tint = originalTint || 0xffffff;
      if (originalName) token.document.name = originalName;

      await token.refresh();
    } catch (error) {
      console.error(`${this.ID} | Error restoring token appearance:`, error);
    }
  }

  static async showTokenInfo(token) {
    if (!ANewFoe.isMonsterRevealed(token.document)) {
      return;
    }

    try {
      // If instance exists but is closing, wait for it to finish
      if (MonsterInfoDisplay.instance?._state === CLOSING) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      // If same window exists and is rendered, bring to front
      if (
        MonsterInfoDisplay.instance?.token.id === token.id &&
        MonsterInfoDisplay.instance._state === RENDERED
      ) {
        MonsterInfoDisplay.instance.bringToTop();
        return;
      }

      // Close any existing window
      if (MonsterInfoDisplay.instance) {
        await MonsterInfoDisplay.instance.close();
        MonsterInfoDisplay.instance = null;
      }

      // Create and render new window
      const display = new MonsterInfoDisplay(token);
      await display.render(true);
    } catch (error) {
      console.error(`${this.ID} | Error showing token info:`, error);
    }
  }

  // GM overlay system
  static async updateTokenOverlay(token) {
    if (!game.user.isGM || !token?.document?.flags) return;

    try {
      // Clean up existing overlay
      if (token.revealOverlay) {
        if (
          token.revealOverlay.destroy &&
          typeof token.revealOverlay.destroy === "function"
        ) {
          token.revealOverlay.destroy({ children: true });
        }
        token.removeChild(token.revealOverlay);
        token.revealOverlay = null;
      }

      // Get non-GM players
      const players = game.users.filter((u) => !u.isGM && u.active);
      if (players.length === 0) return;

      const actorId = token.document.getFlag(this.ID, "actorId");
      if (!actorId) return;

      // Calculate how many players know this monster
      const knownCount = players.reduce((count, player) => {
        const learnedMonsters =
          game.settings.get(this.ID, "learnedMonsters") || {};
        const revealedTo =
          token.document.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];

        const knows =
          learnedMonsters[player.id]?.includes(actorId) ||
          revealedTo.includes(player.id);
        return count + (knows ? 1 : 0);
      }, 0);

      // Create new overlay
      const overlay = new PIXI.Container();

      // Draw the indicator circle
      const graphics = new PIXI.Graphics();
      const radius = Math.min(token.w, token.h) * 0.05;
      const color =
        knownCount === 0
          ? 0xff0000
          : knownCount < players.length
          ? 0xffa500
          : 0x00ff00;

      graphics.lineStyle(1, 0x000000, 1);
      graphics.beginFill(color, 0.5);
      graphics.drawCircle(radius, radius, radius);
      graphics.endFill();

      overlay.addChild(graphics);

      // Add count text if some but not all players know
      if (knownCount > 0 && knownCount < players.length) {
        const text = new PIXI.Text(knownCount.toString(), {
          fontSize: radius * 1.5,
          fill: "white",
          fontFamily: "Arial Black",
        });
        text.anchor.set(0.5);
        text.position.set(radius, radius);
        overlay.addChild(text);
      }

      // Add overlay to token
      token.addChild(overlay);
      token.revealOverlay = overlay;
      overlay.zIndex = 999;

      // Force token to sort its children
      token.sortableChildren = true;
      token.sortChildren();
    } catch (error) {
      console.error(`${this.ID} | Error updating token overlay:`, error);
    }
  }

  static async revealMonster(token, selectedPlayerIds) {
    try {
      const actorId = token.document.getFlag(this.ID, "actorId");
      // Use learnedMonsters instead of token flags
      const learnedMonsters =
        game.settings.get(this.ID, "learnedMonsters") || {};
      const currentlyKnown = learnedMonsters[selectedPlayerIds[0]] || [];

      // Get all players that already know this actor
      const allPlayers = game.users.filter((u) => !u.isGM).map((u) => u.id);
      const revealedTo = allPlayers.filter((pid) => {
        return (learnedMonsters[pid] || []).includes(actorId);
      });

      // Determine reveal/unreveal sets
      const playersToReveal = selectedPlayerIds.filter(
        (p) => !revealedTo.includes(p)
      );
      const playersToUnreveal = revealedTo.filter(
        (p) => !selectedPlayerIds.includes(p)
      );

      // Reveal: learnMonsterType
      for (const p of playersToReveal) {
        await this.learnMonsterType(token.document, p);
      }

      // Unreveal: unlearnMonsterType
      for (const p of playersToUnreveal) {
        await this.unlearnMonsterType(token.document, p);
      }

      // Apply changes to any tokens of the same actor
      const sameTypeTokens = canvas.tokens.placeables.filter(
        (t) => t.document.getFlag(this.ID, "actorId") === actorId
      );

      sameTypeTokens.forEach((t) => this._processTokenVisibility(t));

      // Update actor permissions with error handling
      if (token.actor) {
        try {
          const updates = {
            "permission.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
          };

          for (const playerId of selectedPlayerIds) {
            updates[`permission.${playerId}`] =
              CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
          }

          await token.actor.update(updates);
        } catch (error) {
          console.error(
            `${this.ID} | Error updating actor permissions:`,
            error
          );
        }
      }

      // Send notifications to affected players
      if (playersToReveal.length > 0) {
        await this._notifyPlayersOfReveal(
          token,
          sameTypeTokens,
          playersToReveal,
          actorId,
          true
        );
      }

      if (playersToUnreveal.length > 0) {
        await this._notifyPlayersOfReveal(
          token,
          sameTypeTokens,
          playersToUnreveal,
          actorId,
          false
        );
      }

      // Update GM overlay
      if (game.user.isGM) {
        for (const token of sameTypeTokens) {
          await this.updateTokenOverlay(token);
        }
      }
    } catch (error) {
      console.error(`${this.ID} | Error in reveal monster:`, error);
      ui.notifications.error("Error updating monster reveal status");
    }
  }

  // Add this new helper method
  static async _notifyPlayersOfReveal(
    token,
    sameTypeTokens,
    playerIds,
    actorId,
    isRevealing
  ) {
    try {
      // Create chat message
      if (game.settings.get(this.ID, "sendPlayerChat")) {
        await ChatMessage.create({
          content: `${isRevealing ? token.name : "A token"} has been ${
            isRevealing ? "revealed to" : "hidden from"
          } you.`,
          whisper: playerIds,
          speaker: ChatMessage.getSpeaker({ alias: "System" }),
        });
      }

      // Notify each player individually
      for (const playerId of playerIds) {
        game.socket.emit(`module.${this.ID}`, {
          type: "monsterRevealed",
          userId: playerId,
          tokenIds: sameTypeTokens.map((t) => t.id),
          tokenName: token.name,
          actorId: actorId,
          isRevealed: isRevealing,
        });
      }
    } catch (error) {
      console.error(`${this.ID} | Error notifying players:`, error);
    }
  }

  static async showRevealDialog(tokens) {
    // Ensure tokens is an array
    if (!Array.isArray(tokens)) {
      tokens = [tokens];
    }

    // Get the first token for template data
    const mainToken = tokens[0];
    const learnedMonsters = game.settings.get(this.ID, "learnedMonsters") || {};
    const revealedTo =
      mainToken.document.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];

    // Get players with their current reveal status
    const players = game.users
      .filter((u) => !u.isGM)
      .map((u) => ({
        id: u.id,
        name: u.name,
        known:
          revealedTo.includes(u.id) ||
          learnedMonsters[u.id]?.includes(
            mainToken.document.getFlag(this.ID, "actorId")
          ),
      }));

    const content = await renderTemplate(this.TEMPLATES.REVEAL_DIALOG, {
      img: mainToken.document.texture.src,
      name:
        tokens.length > 1
          ? `${tokens.length} Selected Monsters`
          : mainToken.name,
      players: players,
    });

    new Dialog({
      title: tokens.length > 1 ? "Reveal Multiple Monsters" : "Reveal Monster",
      content: content,
      buttons: {
        reveal: {
          icon: '<i class="fas fa-eye"></i>',
          label: "Reveal",
          callback: async (html) => {
            const selectedPlayerIds = html
              .find('input[name="players"]:checked')
              .map(function () {
                return this.value;
              })
              .get();

            // Process each token
            for (const token of tokens) {
              await this.revealMonster(token, selectedPlayerIds);
            }
          },
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
        },
      },
      default: "reveal",
    }).render(true);
  }

  static async learnMonsterType(tokenDocument, userId) {
    // Remove reliance on REVEALED_TO token flag
    const actorId = tokenDocument.getFlag(this.ID, "actorId");
    if (!actorId) return;

    const learnedMonsters = game.settings.get(this.ID, "learnedMonsters") || {};
    learnedMonsters[userId] = learnedMonsters[userId] || [];

    if (!learnedMonsters[userId].includes(actorId)) {
      learnedMonsters[userId].push(actorId);
      await game.settings.set(this.ID, "learnedMonsters", learnedMonsters);
    }
  }

  static async unlearnMonsterType(tokenDocument, userId) {
    // Similarly, remove reliance on REVEALED_TO token flag
    const actorId = tokenDocument.getFlag(this.ID, "actorId");
    if (!actorId) return;

    try {
      // Update learned monsters
      const learnedMonsters =
        game.settings.get(this.ID, "learnedMonsters") || {};
      if (learnedMonsters[userId]) {
        learnedMonsters[userId] = learnedMonsters[userId].filter(
          (id) => id !== actorId
        );
        await game.settings.set(this.ID, "learnedMonsters", learnedMonsters);
      }

      // Clear revealed stats
      const revealedStats = game.settings.get(this.ID, "revealedStats") || {};
      const statKey = `${userId}.${actorId}`;
      if (revealedStats[statKey]) {
        delete revealedStats[statKey];
        await game.settings.set(this.ID, "revealedStats", revealedStats);
      }

      // Update all tokens of this actor type in all scenes
      const scenes = game.scenes;
      for (const scene of scenes) {
        const tokens = scene.tokens.filter(
          (t) => t.getFlag(this.ID, "actorId") === actorId
        );
        for (const token of tokens) {
          const revealedTo =
            token.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];
          const updatedRevealedTo = revealedTo.filter((id) => id !== userId);

          await token.update({
            [`flags.${this.ID}.${this.FLAGS.REVEALED}`]:
              updatedRevealedTo.length > 0,
            [`flags.${this.ID}.${this.FLAGS.REVEALED_TO}`]: updatedRevealedTo,
          });
        }
      }
    } catch (error) {
      console.error(`${this.ID} | Error unlearning monster:`, error);
    }
  }

  // Move these methods into the ANewFoe class and make them static
  static isMonsterTypeKnown(tokenOrDocument) {
    try {
      const document = tokenOrDocument.document ?? tokenOrDocument;
      if (!document?.flags) return false;

      const actorId = document.getFlag(this.ID, "actorId");
      if (!actorId) return false;

      const learnedMonsters =
        game.settings.get(this.ID, "learnedMonsters") || {};
      return learnedMonsters[game.user.id]?.includes(actorId) || false;
    } catch (error) {
      console.error(`${this.ID} | Error checking monster known status:`, error);
      return false;
    }
  }

  static isMonsterRevealed(tokenOrDocument) {
    try {
      const document = tokenOrDocument.document ?? tokenOrDocument;
      const actorId = document.getFlag(this.ID, "actorId");

      // First check if monster type is known
      const learnedMonsters =
        game.settings.get(this.ID, "learnedMonsters") || {};
      if (learnedMonsters[game.user.id]?.includes(actorId)) {
        return true;
      }

      // Then check individual token reveal status
      const revealed = document.getFlag(this.ID, this.FLAGS.REVEALED);
      if (!revealed) return false;

      const revealedTo =
        document.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];
      return revealedTo.includes(game.user.id);
    } catch (error) {
      console.error(
        `${this.ID} | Error checking monster reveal status:`,
        error
      );
      return false;
    }
  }

  static async processStatRoll(data) {
    try {
      const key = data.key;
      const dc = parseInt(data.dc);
      const usePlayerStats = data.usePlayerStats;
      const actorId = data.actorId;

      // Remove the pending request
      this.removePendingRequest(game.user.id, actorId, key);

      let rollFormula = "1d20";
      if (usePlayerStats && MonsterInfoDisplay.isAbilityCheck(key)) {
        const actor = game.user.character;
        if (actor) {
          const modifier = actor.system.abilities[key].mod;
          rollFormula += `${modifier >= 0 ? "+" : ""}${modifier}`;
        }
      }

      const roll = new Roll(rollFormula);
      await roll.evaluate();

      let rollMessage = `Attempting to discern ${key.toUpperCase()}...`;
      if (usePlayerStats && MonsterInfoDisplay.isAbilityCheck(key)) {
        rollMessage += ` (${key.toUpperCase()} Check with ${roll.formula})`;
      }

      await ChatMessage.create({
        flavor: rollMessage,
        speaker: ChatMessage.getSpeaker(),
        rolls: [roll],
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        sound: CONFIG.sounds.dice,
      });

      if (roll.total >= dc) {
        game.socket.emit(`module.${this.ID}`, {
          type: "revealStat",
          userId: game.user.id,
          actorId: actorId,
          key: key,
        });
      } else {
        ui.notifications.info("The check failed to reveal the stat.");
      }

      // If display exists, refresh it
      if (MonsterInfoDisplay.instance) {
        await MonsterInfoDisplay.instance.refresh();
      }
    } catch (error) {
      console.error(`${this.ID} | Error processing stat roll:`, error);
      ui.notifications.error("There was an error processing the roll.");
    }
  }

  static async handleApproval(data) {
    try {
      // Clear timeout if it exists
      const timeoutKey = `${data.userId}-${data.actorId}-${data.statKey}`;
      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
        this.TIMEOUTS.delete(timeoutKey);
      }

      // Send approval to player with all necessary data
      game.socket.emit(`module.${this.ID}`, {
        type: "processApprovedStatRoll",
        userId: data.userId,
        actorId: data.actorId,
        key: data.statKey,
        dc: data.dc,
        usePlayerStats: data.usePlayerStats,
      });

      // Remove the request from pending
      this.removePendingRequest(data.userId, data.actorId, data.statKey);

      // Update UI
      if (GMQueueApplication.instance) {
        GMQueueApplication.instance.render(true);
      }
    } catch (error) {
      console.error(`${this.ID} | Error handling approval:`, error);
    }
  }

  static async handleRejection(data) {
    if (!game.user.isGM) return;

    try {
      // Remove the pending request
      this.removePendingRequest(data.userId, data.actorId, data.statKey);

      // Notify the player
      game.socket.emit(`module.${this.ID}`, {
        type: "statRollRejected",
        userId: data.userId,
        actorId: data.actorId,
        key: data.statKey,
      });

      // Update the GM queue UI
      this.updateGMApprovalUI();
    } catch (error) {
      console.error(`${this.ID} | Error handling rejection:`, error);
    }
  }

  static removePendingRequest(userId, actorId, statKey) {
    if (game.user.isGM) {
      // Clear auto-reject timeout if it exists
      const timeoutKey = `${userId}-${actorId}-${statKey}`;
      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
        this.TIMEOUTS.delete(timeoutKey);
      }

      // Remove the request and update the UI
      const initialLength = this.PENDING_REQUESTS.length;
      this.PENDING_REQUESTS = this.PENDING_REQUESTS.filter(
        (req) =>
          !(
            req.userId === userId &&
            req.actorId === actorId &&
            req.statKey === statKey
          )
      );

      if (this.PENDING_REQUESTS.length !== initialLength) {
        this.savePendingRequests();
        this.updateGMApprovalUI();
      }
    } else {
      // Player sends a socket message to GM to remove the pending request
      game.socket.emit(`module.${this.ID}`, {
        type: "removePendingRequest",
        userId,
        actorId,
        statKey,
      });
    }
  }
}

// Add a new GMQueueApplication class
class GMQueueApplication extends Application {
  static instance = null;

  constructor(options = {}) {
    super(options);
    GMQueueApplication.instance = this;
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "gm-approval-queue",
      template: "modules/anewfoe/templates/gm-queue.html",
      title: "Monster Knowledge Requests",
      width: 300,
      height: "auto",
      minimizable: true,
      resizable: true,
      dragDrop: [],
      classes: ["gm-queue-window"],
      popOut: true,
    });
  }

  getData() {
    return {
      requests: ANewFoe.PENDING_REQUESTS.map((req) => {
        const user = game.users.get(req.userId);
        const actor = game.actors.get(req.actorId);
        return {
          ...req,
          userName: user?.name || "Unknown",
          monsterName: actor?.name || "Unknown Monster",
        };
      }),
    };
  }

  /** @override */
  setPosition(options = {}) {
    const savedPosition = game.settings.get(ANewFoe.ID, "gmQueuePosition");
    if (savedPosition) {
      options = foundry.utils.mergeObject(savedPosition, options);
    }
    return super.setPosition(options);
  }

  /** @override */
  async close(options = {}) {
    if (this.position) {
      await game.settings.set(ANewFoe.ID, "gmQueuePosition", this.position);
    }
    return super.close(options);
  }

  activateListeners(html) {
    super.activateListeners(html);

    html.on("click", ".approve-request", async (event) => {
      const data = event.currentTarget.dataset;
      // Find the full request data from PENDING_REQUESTS
      const request = ANewFoe.PENDING_REQUESTS.find(
        (req) =>
          req.userId === data.userId &&
          req.actorId === data.actorId &&
          req.statKey === data.key
      );

      if (request) {
        await ANewFoe.handleApproval(request);
      }
    });

    html.on("click", ".reject-request", async (event) => {
      const data = event.currentTarget.dataset;
      const request = ANewFoe.PENDING_REQUESTS.find(
        (req) =>
          req.userId === data.userId &&
          req.actorId === data.actorId &&
          req.statKey === data.key
      );

      if (request) {
        await ANewFoe.handleRejection(request);
      }
    });

    // Existing approve handler...
  }
}

// Adjust the module initialization
Hooks.once("init", () => {
  CONFIG.debug.hooks = true;
});

// Move the initialization to the 'ready' hook
Hooks.once("ready", () => {
  ANewFoe.initialize();
});
