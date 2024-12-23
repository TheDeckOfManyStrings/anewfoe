const RENDERED = 2;
const CLOSING = 3;

/**
 * Represents a FormApplication for applying DC modifiers.
 * @extends FormApplication
 */
class DCModifiersConfig extends FormApplication {
  /**
   * Provides the default options.
   * @override
   * @returns {Object}
   */
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

  /**
   * Retrieves current DC modifiers for the template.
   * @param {Object} options - Form options
   * @returns {Object}
   */
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

  /**
   * Called when the form is submitted to update settings.
   * @param {Event} event - The form submission event
   * @param {Object} formData - Form data
   */
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

/**
 * Provides a FormApplication for bulk-uploading monster knowledge.
 * @extends FormApplication
 */
class BulkUploadConfig extends FormApplication {
  /**
   * Default application configuration options.
   * @override
   * @returns {Object}
   */
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

  /**
   * Prepares data for the bulk upload form.
   * @param {Object} options - Form options
   * @returns {Object}
   */
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

  /**
   * Handles form submission for bulk uploading data.
   * @param {Event} event - The form submission event
   * @param {Object} formData - Submitted form data
   */
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

  /**
   * Parses content from the provided JSON file or text area.
   * @param {string} content - Raw JSON content
   * @returns {Array} Array of monster names
   */
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

  /**
   * Processes the parsed list of monster names for a given player.
   * @param {string} playerId - The player's ID
   * @param {Array} monsterNames - List of monster names
   */
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

  /**
   * Wipes known monsters for the specified player.
   * @param {string} playerId - The player's ID
   */
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

  /**
   * Activates HTML listeners for form operations.
   * @param {jQuery} html - The JQuery-processed HTML of the form
   */
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

/**
 * Displays monster info for a particular token.
 * @extends Application
 */
class MonsterInfoDisplay extends Application {
  static instance = null;

  /**
   * Initializes the display for a given token.
   * @param {Token} token - The token to display
   * @param {Object} options - Optional config
   */
  constructor(token, options = {}) {
    super(options);
    this.token = token;
    this.actor = token.actor;
    MonsterInfoDisplay.instance = this;
  }

  /**
   * Provides the default options for the display.
   * @override
   * @returns {Object}
   */
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

  /**
   * Retrieves stats and display data for the template.
   * @returns {Object}
   */
  async getData() {
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

  /**
   * Formats numeric modifiers for display.
   * @param {number} mod - Numeric modifier
   * @returns {string}
   */
  _getModifier(mod) {
    return mod >= 0 ? `+${mod}` : mod.toString();
  }

  /**
   * Computes DC values based on chosen calculation method.
   * @returns {Object}
   */
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

    const gmAdjustments =
      game.settings.get(ANewFoe.ID, "gmDCAdjustments") || {};
    for (const key in dcValues) {
      if (gmAdjustments[key] !== undefined) {
        dcValues[key] += gmAdjustments[key];
      }
    }

    return dcValues;
  }

  /**
   * Calculates DC by Challenge Rating.
   * @param {number} cr - The CR of the monster
   * @returns {number}
   */
  _calculateCRBasedDC(cr) {
    const maxCR = 30;
    const minDC = 10;
    const maxDC = 30;
    const scaledDC = minDC + (maxDC - minDC) * Math.pow(cr / maxCR, 0.5);
    return Math.round(scaledDC);
  }

  /**
   * Retrieves the current player's ability modifier for a stat.
   * @param {string} ability - The ability key (e.g. "str", "dex")
   * @returns {number}
   */
  async getPlayerModifier(ability) {
    try {
      const userId = game.user.id;

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

  /**
   * Activates listeners for interactive stat rolling.
   * @override
   * @param {jQuery} html - JQuery HTML element
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.find(".stat-roll").click(async (event) => {
      try {
        const button = event.currentTarget;
        const key = button.dataset.key;
        const dc = parseInt(button.dataset.dc);

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
          game.socket.emit(`module.${ANewFoe.ID}`, {
            type: "requestStatRoll",
            userId: game.user.id,
            actorId: this.actor.id,
            tokenId: this.token.id,
            key: key,
            dc: dc,
            usePlayerStats: usePlayerStats,
          });
          ANewFoe.addPendingRequest(game.user.id, this.actor.id, key);
          ui.notifications.info(
            "Your request to discover the stat has been sent to the GM for approval."
          );
          return;
        }

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

  /**
   * Re-renders the application to update data.
   */
  async refresh() {
    await this.render(true);
  }

  /**
   * Sets the position of this window.
   * @override
   * @param {Object} options - Positioning options
   */
  setPosition(options = {}) {
    const savedPosition = game.settings.get(ANewFoe.ID, "monsterInfoPosition");
    if (savedPosition) {
      options = foundry.utils.mergeObject(savedPosition, options);
    }

    return super.setPosition(options);
  }

  /**
   * Closes the display and saves position settings.
   * @override
   * @param {Object} options - Close options
   */
  async close(options = {}) {
    if (this.position) {
      await game.settings.set(ANewFoe.ID, "monsterInfoPosition", this.position);
    }

    if (MonsterInfoDisplay.instance === this) {
      MonsterInfoDisplay.instance = null;
    }

    return super.close(options);
  }

  /**
   * Renders the display, applying any stored position info.
   * @override
   * @param {boolean} force - Force render
   * @param {Object} options - Rendering options
   */
  async _render(force = false, options = {}) {
    await super._render(force, options);
    this.setPosition();
  }

  /**
   * Processes a stat roll once approved by the GM.
   * @param {Object} data - Data needed to execute the roll
   */
  async processApprovedStatRoll(data) {
    try {
      const key = data.key;
      const dc = parseInt(data.dc);
      const usePlayerStats = data.usePlayerStats;
      const actorId = data.actorId;

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

      const roll = new Roll(rollFormula);
      await roll.evaluate();

      const total = roll.total;

      await ChatMessage.create({
        flavor: `Attempting to discern ${key.toUpperCase()}...`,
        speaker: ChatMessage.getSpeaker(),
        rolls: [roll],
        type: CONST.CHAT_MESSAGE_TYPES.ROLL,
        sound: CONFIG.sounds.dice,
      });

      if (total >= dc) {
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

  /**
   * Checks if a stat key represents an ability check.
   * @param {string} key - The stat key
   * @returns {boolean}
   */
  static isAbilityCheck(key) {
    const isAbility = ["str", "dex", "con", "int", "wis", "cha"].includes(key);
    return isAbility;
  }
}

/**
 * Manages knowledge and reveal logic for monsters.
 */
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

  static TIMEOUTS = new Map();

  /**
   * Initializes module settings and hooks on game ready.
   */
  static initialize() {
    this.registerSettings();
    this.registerHooks();
    this.setupSocket();

    this.loadPendingRequests();

    if (!game.user.isGM) {
      this.syncPendingRequestsWithGM();
    }

    if (game.user.isGM && game.settings.get(this.ID, "enableStatReveal")) {
      this.createGMApprovalUI();
      this.updateGMApprovalUI();
    }
  }

  /**
   * Requests the GM to synchronize pending monster knowledge requests with this user.
   */
  static syncPendingRequestsWithGM() {
    setTimeout(() => {
      game.socket.emit(`module.${this.ID}`, {
        type: "requestPendingSync",
        userId: game.user.id,
      });
    }, 500);
  }

  /**
   * Loads pending requests from stored settings and updates the GM approval UI.
   */
  static loadPendingRequests() {
    const storedRequests = game.settings.get(this.ID, "pendingRequests") || [];
    this.PENDING_REQUESTS = storedRequests;
    this.updateGMApprovalUI();
  }

  /**
   * Persists current pending requests into world settings.
   */
  static savePendingRequests() {
    if (game.user.isGM) {
      game.settings.set(this.ID, "pendingRequests", this.PENDING_REQUESTS);
    }
  }

  /**
   * Sets up socket listeners and message handling for monster reveal and stat checks.
   */
  static setupSocket() {
    const socketName = `module.${this.ID}`;

    game.socket.off(socketName);

    game.socket.on(socketName, async (data, ack) => {
      await this.handleSocketMessage(data);
      if (ack && typeof ack === "function") ack({ received: true });
    });
  }

  /**
   * Primary handler for all incoming socket messages related to monster knowledge.
   * @param {Object} data - The data object received over the socket
   */
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
            ANewFoe.removePendingRequest(data.userId, data.actorId, data.key);
            ui.notifications.info("Your request was rejected by the GM.");
          }
          if (game.user.isGM) {
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
            this.PENDING_REQUESTS = data.requests.filter(
              (req) => req.userId === game.user.id
            );

            if (MonsterInfoDisplay.instance) {
              await MonsterInfoDisplay.instance.refresh();
            }
          }
          break;
        case "monsterRevealed":
          if (game.user.id === data.userId) {
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

  /**
   * Applies flags to a token once the GM approves reveal.
   * @param {Object} data - Token-related data
   */
  static async handleSetTokenFlags(data) {
    if (!game.user.isGM) return;

    try {
      const token = canvas.tokens.get(data.tokenId);
      if (!token) return;
      await ANewFoe.learnMonsterType(token.document, data.userId);
    } catch (error) {
      console.error(`${this.ID} | Error setting token flags:`, error);
    }
  }

  /**
   * Manages a newly revealed stat for a specific user.
   * @param {Object} data - Data about the revealed stat
   */
  static async handleStatRevealed(data) {
    try {
      const messageKey = `${data.userId}-${data.key}-${data.actorId}`;
      const now = Date.now();

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

  /**
   * Reveals stats server-side if GM is present.
   * @param {Object} data - Data about which stat to reveal
   */
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

  /**
   * Handles a player's request to roll for monster info.
   * @param {Object} data - Relevant roll request data
   */
  static async handleStatRollRequest(data) {
    if (!game.user.isGM) return;

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

    this.PENDING_REQUESTS.push({
      userId: data.userId,
      actorId: data.actorId,
      statKey: data.key,
      tokenId: data.tokenId,
      dc: data.dc,
      usePlayerStats: data.usePlayerStats,
    });

    this.savePendingRequests();

    this.updateGMApprovalUI();

    if (!GMQueueApplication.instance) {
      this.createGMApprovalUI();
    }

    if (game.settings.get(this.ID, "enableAutoReject")) {
      const timeoutMinutes = game.settings.get(this.ID, "autoRejectTimer");
      const timeoutMs = timeoutMinutes * 60 * 1000;
      const timeoutKey = `${data.userId}-${data.actorId}-${data.key}`;

      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
      }

      const timeout = setTimeout(() => {
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

  /**
   * Processes an approved roll for the requesting player.
   * @param {Object} data - Roll data
   */
  static async handleStatRollApproved(data) {
    if (game.user.id !== data.userId) return;
    const display = MonsterInfoDisplay.instance;
    if (display) {
      await display.processApprovedStatRoll(data);
    }
  }

  /**
   * Informs a player that their roll request was rejected.
   * @param {Object} data - Request data
   */
  static async handleStatRollRejected(data) {
    if (game.user.id !== data.userId) return;
    const display = MonsterInfoDisplay.instance;
    if (display) {
      ANewFoe.removePendingRequest(data.userId, display.actor.id, data.key);
      ui.notifications.info("Your request was rejected by the GM.");
    }
  }

  /**
   * Submits a new pending request to reveal or roll stats.
   * @param {string} userId - Player user ID
   * @param {string} actorId - The actor's ID
   * @param {string} statKey - The stat being requested
   */
  static addPendingRequest(userId, actorId, statKey) {
    if (game.user.isGM) {
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

        game.socket.emit(`module.${this.ID}`, {
          type: "pendingRequestsSync",
          userId: userId,
          requests: this.PENDING_REQUESTS.filter(
            (req) => req.userId === userId
          ),
        });
      }
    } else {
      game.socket.emit(`module.${this.ID}`, {
        type: "addPendingRequest",
        userId,
        actorId,
        statKey,
      });
    }
  }

  /**
   * Removes a pending request if found in the queue.
   * @param {string} userId - Player user ID
   * @param {string} actorId - Actor ID
   * @param {string} statKey - Stat being requested
   */
  static removePendingRequest(userId, actorId, statKey) {
    if (game.user.isGM) {
      const timeoutKey = `${userId}-${actorId}-${statKey}`;
      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
        this.TIMEOUTS.delete(timeoutKey);
      }

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
      game.socket.emit(`module.${this.ID}`, {
        type: "removePendingRequest",
        userId,
        actorId,
        statKey,
      });
    }
  }

  /**
   * Checks if a request is currently pending.
   * @param {string} userId - Player user ID
   * @param {string} actorId - The actor's ID
   * @param {string} statKey - The stat in question
   * @returns {boolean}
   */
  static isRequestPending(userId, actorId, statKey) {
    const pendingRequests = game.settings.get(this.ID, "pendingRequests") || [];

    return pendingRequests.some(
      (req) =>
        req.userId === userId &&
        req.actorId === actorId &&
        req.statKey === statKey
    );
  }

  /**
   * Creates the GM approval UI if user is the game master.
   */
  static createGMApprovalUI() {
    if (!game.user.isGM || GMQueueApplication.instance) return;

    const queue = new GMQueueApplication();
    queue.render(true);
  }

  /**
   * Updates the GM approval UI with current requests.
   */
  static updateGMApprovalUI() {
    if (!game.user.isGM) return;

    if (!GMQueueApplication.instance) {
      this.createGMApprovalUI();
    } else {
      GMQueueApplication.instance.render();
    }
  }

  /**
   * Registers all relevant settings for this module.
   */
  static registerSettings() {
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

    game.settings.registerMenu(this.ID, "dcModifiersMenu", {
      name: "DC Modifiers",
      label: "Modify DC Values",
      hint: "Adjust the difficulty modifiers for each stat",
      icon: "fas fa-sliders-h",
      type: DCModifiersConfig,
      restricted: true,
    });

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

    game.settings.register(this.ID, "pendingRequests", {
      name: "Pending Requests",
      scope: "world",
      config: false,
      type: Array,
      default: [],
    });

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

    game.settings.registerMenu(this.ID, "bulkUploadMenu", {
      name: "Bulk Upload Monster Knowledge",
      label: "Bulk Upload",
      hint: "Upload a list of monster names to grant knowledge to a player",
      icon: "fas fa-upload",
      type: BulkUploadConfig,
      restricted: true,
    });

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

  /**
   * Registers system hooks and modifies token behavior.
   */
  static registerHooks() {
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

    Hooks.on("createToken", async (document, options, userId) => {
      if (!game.user.isGM) {
        const token = document.object;
        const actorId = document.getFlag(this.ID, "actorId");

        const learnedMonsters =
          game.settings.get(this.ID, "learnedMonsters") || {};
        const isLearned = learnedMonsters[game.user.id]?.includes(actorId);

        if (isLearned) {
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

    Hooks.on("canvasReady", async () => {
      // Add delay to ensure tokens are fully loaded
      await new Promise((resolve) => setTimeout(resolve, 500));

      for (const token of canvas.tokens.placeables) {
        // Skip if token isn't ready for rendering
        if (
          !token?.mesh?.texture?.baseTexture?.valid ||
          !token?.scene ||
          token._destroyed
        )
          continue;

        try {
          if (
            !token.document?.flags ||
            !token.document.getFlag(this.ID, "actorId")
          ) {
            continue;
          }

          const isKnown = this.isMonsterTypeKnown(token.document);
          const isRevealed = this.isMonsterRevealed(token.document);

          if (game.user.isGM) {
            await this.updateTokenOverlay(token);
          } else {
            if (isKnown || isRevealed) {
              await this._restoreTokenAppearance(token);
              this._makeTokenClickable(token);
            } else if (token.mesh?.texture) {
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
    });

    Hooks.on("refreshToken", async (token) => {
      if (
        !token?.mesh?.texture?.baseTexture?.valid ||
        !token?.parent ||
        !token?.scene ||
        token._destroyed
      )
        return;
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
          if (token.mesh) {
            token.mesh.tint = 0x000000;
            token.mesh.alpha = 1;
          }
          token.alpha = 1;
        }
      } else if (token?.document?.flags) {
        setTimeout(() => {
          this.updateTokenOverlay(token);
        }, 100);
      }
    });

    Hooks.on("updateToken", async (document, changes, options, userId) => {
      const token = document.object;
      if (!game.user.isGM && token) {
        if (changes.hasOwnProperty("hidden")) {
          const isKnown = ANewFoe.isMonsterTypeKnown(document);
          const isRevealed = ANewFoe.isMonsterRevealed(document);

          if (!isKnown && !isRevealed) {
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

    Hooks.on("drawToken", (token) => {
      if (
        !token?.mesh?.texture?.baseTexture?.valid ||
        !token?.parent ||
        !token?.scene ||
        token._destroyed
      )
        return;
      if (!token || !token?.parent || !token?.scene || token._destroyed) return;
      if (!token?.parent) return;
      if (game.user.isGM) {
        setTimeout(() => ANewFoe.updateTokenOverlay(token), 100);
      }
    });

    Hooks.on("updateToken", (document, changes, options, userId) => {
      const token = document.object;
      if (!game.user.isGM && token) {
        if (changes.hasOwnProperty("hidden")) {
          const isKnown = ANewFoe.isMonsterTypeKnown(document);
          const isRevealed = ANewFoe.isMonsterRevealed(document);

          if (!isKnown && !isRevealed) {
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

    Hooks.on("preUpdateToken", (document, changes, options, userId) => {
      if (!game.user.isGM && changes.hidden === false) {
        const token = document.object;
        if (
          token &&
          !ANewFoe.isMonsterTypeKnown(document) &&
          !ANewFoe.isMonsterRevealed(document)
        ) {
          if (token._alphaTransition) {
            token._alphaTransition.cancel();
            token._alphaTransition = null;
          }
        }
      }
    });

    Hooks.on("preUpdateToken", (document, changes, options, userId) => {
      if (!game.user.isGM && changes.hidden === false) {
        const token = document.object;
        if (
          token &&
          !ANewFoe.isMonsterTypeKnown(document) &&
          !ANewFoe.isMonsterRevealed(document)
        ) {
          const originalTransition = token._animateVisibility;
          token._animateVisibility = () => {
            token.alpha = 1;
            return Promise.resolve(true);
          };

          setTimeout(() => {
            token._animateVisibility = originalTransition;
          }, 100);
        }
      }
    });

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
            if (token._animation) token._animation.kill();
            if (token._alphaTransition) token._alphaTransition.kill();

            if (token.mesh) {
              token.mesh.tint = 0x000000;
              token.mesh.alpha = 1;
            }

            token.alpha = 1;
            if (token.mesh) token.mesh.alpha = 1;

            options.animation = false;
          }
        }
      },
      { priority: 100 }
    );

    Hooks.on("canvasReady", () => {
      if (game.user.isGM) {
        if (!this.gmApprovalUI) {
          this.createGMApprovalUI();
        }
      }
    });

    Hooks.on("closeApplication", () => {
      if (this.gmApprovalUI) {
        this.gmApprovalUI.remove();
        this.gmApprovalUI = null;
      }
    });

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

  /**
   * Makes a token clickable for reveal or info.
   * @param {Token} token - The token to modify
   */
  static _makeTokenClickable(token) {
    try {
      if (!token || !token.actor) {
        return;
      }

      token.interactive = true;
      token.buttonMode = true;

      if (token.mouseInteractionManager) {
        token.mouseInteractionManager.permissions.clickLeft = true;
        token.mouseInteractionManager.callbacks.clickLeft = async (event) => {
          try {
            event.preventDefault();
            event.stopPropagation();

            const userId = game.user.id;
            if (!token.actor) {
              console.warn(
                `${this.ID} | Actor not available for token:`,
                token.name
              );
              return;
            }

            const userPermissionLevel = token.actor.getUserLevel(userId);

            if (userPermissionLevel >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER) {
              return token._onClickLeft(event);
            }

            if (ANewFoe.isMonsterRevealed(token.document)) {
              if (game.settings.get(ANewFoe.ID, "enableStatReveal")) {
                await ANewFoe.showTokenInfo(token);
              }
            }
          } catch (error) {
            console.error(`${this.ID} | Error in click handler:`, error);
          }
        };

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

      token.on("rightdown", (event) => {
        if (event.data.originalEvent.detail === 2) {
          token.setTarget(!token.isTargeted, { releaseOthers: false });
        }
      });
    } catch (error) {
      console.error(`${this.ID} | Error making token clickable:`, error);
    }
  }

  /**
   * Opens or updates the MonsterInfoDisplay window.
   * @param {Token} token - The token for which to show info
   */
  static async showTokenInfo(token) {
    if (!ANewFoe.isMonsterRevealed(token.document)) {
      return;
    }

    try {
      if (MonsterInfoDisplay.instance?._state === CLOSING) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      if (
        MonsterInfoDisplay.instance?.token.id === token.id &&
        MonsterInfoDisplay.instance._state === RENDERED
      ) {
        MonsterInfoDisplay.instance.bringToTop();
        return;
      }

      if (MonsterInfoDisplay.instance) {
        await MonsterInfoDisplay.instance.close();
        MonsterInfoDisplay.instance = null;
      }

      const display = new MonsterInfoDisplay(token);
      await display.render(true);
    } catch (error) {
      console.error(`${this.ID} | Error showing token info:`, error);
    }
  }

  /**
   * Creates a black silhouette overlay for hidden monsters.
   * @param {Token} token - The token to modify
   */
  static _createSimpleSilhouette(token) {
    ANewFoe._removeBlackOverlay(token);

    const background = new PIXI.Graphics();
    background.beginFill(0x000000, 1);
    background.drawRect(0, 0, token.w, token.h);
    background.endFill();
    background.zIndex = 999;

    token.addChild(background);
    token.blackOverlay = background;
  }

  /**
   * Creates an animated overlay for hidden tokens.
   * @param {Token} token - The token to modify
   */
  static _createAnimatedOverlay(token) {
    ANewFoe._removeBlackOverlay(token);

    const container = new PIXI.Container();
    container.zIndex = 999;

    const background = new PIXI.Graphics();
    background.beginFill(0x000000, 1);
    background.drawRect(0, 0, token.w, token.h);
    background.endFill();
    container.addChild(background);

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

  /**
   * Removes any black overlay from a token.
   * @param {Token} token - The token
   */
  static async _removeBlackOverlay(token) {
    if (token.blackOverlay) {
      if (token.blackOverlay.animationFrame) {
        cancelAnimationFrame(token.blackOverlay.animationFrame);
      }
      token.blackOverlay.destroy({ children: true });
      token.blackOverlay = null;
    }
  }

  /**
   * Processes token visibility for hidden or revealed states.
   * @param {Token} token - The token object
   */
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
        if (!token.mesh || !token.mesh.texture) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (!token.mesh || !token.mesh.texture) {
          console.warn(
            `${this.ID} | Token mesh not available, skipping visibility processing`
          );
          return;
        }

        token.visible = true;
        token.alpha = 1;

        token.mesh.tint = 0x000000;
        token.mesh.alpha = 1;

        if (token.text) {
          token.text.text = "Unknown Creature";
          token.text.visible = true;
          token.text.alpha = 1;
          await token.text.draw();
        }

        if (!game.user.isGM) {
          token.interactive = false;
          token.buttonMode = false;
        }

        if (token.mesh && token.mesh.texture) {
          await token.refresh();
        }
      }
    } catch (error) {
      console.error(`${this.ID} | Error processing token visibility:`, error);
      if (token) {
        token.alpha = 1;
        token.visible = true;
      }
    } finally {
      this.OPERATIONS.PROCESSING_VISIBILITY = false;
    }
  }

  /**
   * Restores the original token appearance post-reveal.
   * @param {Token} token - The token object
   */
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

  /**
   * Updates or draws GM overlays if user is GM.
   * @param {Token} token - The token to overlay
   */
  static async updateTokenOverlay(token) {
    if (!game.user.isGM || !token?.document?.flags) return;

    try {
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

      const players = game.users.filter((u) => !u.isGM && u.active);
      if (players.length === 0) return;

      const actorId = token.document.getFlag(this.ID, "actorId");
      if (!actorId) return;

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

      const overlay = new PIXI.Container();

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

      token.addChild(overlay);
      token.revealOverlay = overlay;
      overlay.zIndex = 999;

      token.sortableChildren = true;
      token.sortChildren();
    } catch (error) {
      console.error(`${this.ID} | Error updating token overlay:`, error);
    }
  }

  /**
   * Reveals a monster for selected players.
   * @param {Token} token - The monster token
   * @param {string[]} selectedPlayerIds - Player IDs
   */
  static async revealMonster(token, selectedPlayerIds) {
    try {
      const actorId = token.document.getFlag(this.ID, "actorId");
      const learnedMonsters =
        game.settings.get(this.ID, "learnedMonsters") || {};
      const currentlyKnown = learnedMonsters[selectedPlayerIds[0]] || [];

      const allPlayers = game.users.filter((u) => !u.isGM).map((u) => u.id);
      const revealedTo = allPlayers.filter((pid) => {
        return (learnedMonsters[pid] || []).includes(actorId);
      });

      const playersToReveal = selectedPlayerIds.filter(
        (p) => !revealedTo.includes(p)
      );
      const playersToUnreveal = revealedTo.filter(
        (p) => !selectedPlayerIds.includes(p)
      );

      for (const p of playersToReveal) {
        await this.learnMonsterType(token.document, p);
      }

      for (const p of playersToUnreveal) {
        await this.unlearnMonsterType(token.document, p);
      }

      const sameTypeTokens = canvas.tokens.placeables.filter(
        (t) => t.document.getFlag(this.ID, "actorId") === actorId
      );

      sameTypeTokens.forEach((t) => this._processTokenVisibility(t));

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

  /**
   * Notifies players that a monster was revealed or hidden.
   * @param {Token} token - The primary token
   * @param {Token[]} sameTypeTokens - Related tokens
   * @param {string[]} playerIds - Players to notify
   * @param {string} actorId - The actor ID
   * @param {boolean} isRevealing - True if revealing
   */
  static async _notifyPlayersOfReveal(
    token,
    sameTypeTokens,
    playerIds,
    actorId,
    isRevealing
  ) {
    try {
      if (game.settings.get(this.ID, "sendPlayerChat")) {
        await ChatMessage.create({
          content: `${isRevealing ? token.name : "A token"} has been ${
            isRevealing ? "revealed to" : "hidden from"
          } you.`,
          whisper: playerIds,
          speaker: ChatMessage.getSpeaker({ alias: "System" }),
        });
      }

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

  /**
   * Displays a dialog for deciding which players see a monster.
   * @param {Token[]} tokens - The selected tokens
   */
  static async showRevealDialog(tokens) {
    if (!Array.isArray(tokens)) {
      tokens = [tokens];
    }

    const mainToken = tokens[0];
    const learnedMonsters = game.settings.get(this.ID, "learnedMonsters") || {};
    const revealedTo =
      mainToken.document.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];

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

  /**
   * Grants knowledge of a monster to a player.
   * @param {TokenDocument} tokenDocument - Token doc
   * @param {string} userId - The player's ID
   */
  static async learnMonsterType(tokenDocument, userId) {
    const actorId = tokenDocument.getFlag(this.ID, "actorId");
    if (!actorId) return;

    const learnedMonsters = game.settings.get(this.ID, "learnedMonsters") || {};
    learnedMonsters[userId] = learnedMonsters[userId] || [];

    if (!learnedMonsters[userId].includes(actorId)) {
      learnedMonsters[userId].push(actorId);
      await game.settings.set(this.ID, "learnedMonsters", learnedMonsters);
    }
  }

  /**
   * Removes monster knowledge from a player.
   * @param {TokenDocument} tokenDocument - Token doc
   * @param {string} userId - The player's ID
   */
  static async unlearnMonsterType(tokenDocument, userId) {
    const actorId = tokenDocument.getFlag(this.ID, "actorId");
    if (!actorId) return;

    try {
      const learnedMonsters =
        game.settings.get(this.ID, "learnedMonsters") || {};
      if (learnedMonsters[userId]) {
        learnedMonsters[userId] = learnedMonsters[userId].filter(
          (id) => id !== actorId
        );
        await game.settings.set(this.ID, "learnedMonsters", learnedMonsters);
      }

      const revealedStats = game.settings.get(this.ID, "revealedStats") || {};
      const statKey = `${userId}.${actorId}`;
      if (revealedStats[statKey]) {
        delete revealedStats[statKey];
        await game.settings.set(this.ID, "revealedStats", revealedStats);
      }

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

  /**
   * Checks if a monster type is known by a user.
   * @param {Token|TokenDocument} tokenOrDocument - The token or doc
   * @returns {boolean}
   */
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

  /**
   * Confirms if the monster is fully revealed to the user.
   * @param {Token|TokenDocument} tokenOrDocument - The token or doc
   * @returns {boolean}
   */
  static isMonsterRevealed(tokenOrDocument) {
    try {
      const document = tokenOrDocument.document ?? tokenOrDocument;
      const actorId = document.getFlag(this.ID, "actorId");

      const learnedMonsters =
        game.settings.get(this.ID, "learnedMonsters") || {};
      if (learnedMonsters[game.user.id]?.includes(actorId)) {
        return true;
      }

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

  /**
   * Handles the final steps for rolling a stat check.
   * @param {Object} data - Data regarding the requested roll
   */
  static async processStatRoll(data) {
    try {
      const key = data.key;
      const dc = parseInt(data.dc);
      const usePlayerStats = data.usePlayerStats;
      const actorId = data.actorId;

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

      if (MonsterInfoDisplay.instance) {
        await MonsterInfoDisplay.instance.refresh();
      }
    } catch (error) {
      console.error(`${this.ID} | Error processing stat roll:`, error);
      ui.notifications.error("There was an error processing the roll.");
    }
  }

  /**
   * Processes a GM approval for a player's request.
   * @param {Object} data - Request data
   */
  static async handleApproval(data) {
    try {
      const timeoutKey = `${data.userId}-${data.actorId}-${data.statKey}`;
      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
        this.TIMEOUTS.delete(timeoutKey);
      }

      game.socket.emit(`module.${this.ID}`, {
        type: "processApprovedStatRoll",
        userId: data.userId,
        actorId: data.actorId,
        key: data.statKey,
        dc: data.dc,
        usePlayerStats: data.usePlayerStats,
      });

      this.removePendingRequest(data.userId, data.actorId, data.statKey);

      if (GMQueueApplication.instance) {
        GMQueueApplication.instance.render(true);
      }
    } catch (error) {
      console.error(`${this.ID} | Error handling approval:`, error);
    }
  }

  /**
   * Processes a GM rejection of a player's request.
   * @param {Object} data - Request data
   */
  static async handleRejection(data) {
    if (!game.user.isGM) return;

    try {
      this.removePendingRequest(data.userId, data.actorId, data.statKey);

      game.socket.emit(`module.${this.ID}`, {
        type: "statRollRejected",
        userId: data.userId,
        actorId: data.actorId,
        key: data.statKey,
      });

      this.updateGMApprovalUI();
    } catch (error) {
      console.error(`${this.ID} | Error handling rejection:`, error);
    }
  }

  /**
   * Removes a pending request if found in the queue.
   * @param {string} userId - Player user ID
   * @param {string} actorId - Actor ID
   * @param {string} statKey - Stat being requested
   */
  static removePendingRequest(userId, actorId, statKey) {
    if (game.user.isGM) {
      const timeoutKey = `${userId}-${actorId}-${statKey}`;
      if (this.TIMEOUTS.has(timeoutKey)) {
        clearTimeout(this.TIMEOUTS.get(timeoutKey));
        this.TIMEOUTS.delete(timeoutKey);
      }

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
      game.socket.emit(`module.${this.ID}`, {
        type: "removePendingRequest",
        userId,
        actorId,
        statKey,
      });
    }
  }
}

/**
 * Displays and manages the GM's approval queue.
 * @extends Application
 */
class GMQueueApplication extends Application {
  /**
   * Assigns the static instance property for referencing.
   * @param {Object} options - Application options
   */
  constructor(options = {}) {
    super(options);
    GMQueueApplication.instance = this;
  }

  /**
   * Provides the default Application options.
   * @override
   * @returns {Object}
   */
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

  /**
   * Collects all pending requests to show in the template.
   * @returns {Object}
   */
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

  /**
   * Sets the position of the GM queue window.
   * @override
   * @param {Object} options - Positioning info
   */
  setPosition(options = {}) {
    const savedPosition = game.settings.get(ANewFoe.ID, "gmQueuePosition");
    if (savedPosition) {
      options = foundry.utils.mergeObject(savedPosition, options);
    }
    return super.setPosition(options);
  }

  /**
   * Saves position before closing the queue window.
   * @override
   * @param {Object} options - Close options
   */
  async close(options = {}) {
    if (this.position) {
      await game.settings.set(ANewFoe.ID, "gmQueuePosition", this.position);
    }
    return super.close(options);
  }

  /**
   * Listens for approve/reject clicks in the queue UI.
   * @override
   * @param {jQuery} html - The UI content
   */
  activateListeners(html) {
    super.activateListeners(html);

    html.on("click", ".approve-request", async (event) => {
      const data = event.currentTarget.dataset;
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
  }
}

Hooks.once("init", () => {
  CONFIG.debug.hooks = true;
});

Hooks.once("ready", () => {
  ANewFoe.initialize();
});
