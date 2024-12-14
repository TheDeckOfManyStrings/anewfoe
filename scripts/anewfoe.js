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
      template: `modules/${ANewFoe.ID}/templates/monster-info.html`,
      title: "Monster Info",
      width: 240,
      height: 420,
      maxWidth: 240,
      maxHeight: 420,
      minimizable: true,
      resizable: false,
      classes: ["monster-info-window"],
      popOut: true,
      opacity: 0.5,
    });
  }

  async getData() {
    // Get fresh data each time to ensure current state
    const revealedStats = game.settings.get(ANewFoe.ID, "revealedStats") || {};
    const actorId = this.token.document.getFlag(ANewFoe.ID, "actorId");
    const userId = game.user.id;
    const statKey = `${userId}.${actorId}`;
    const playerStats = revealedStats[statKey] || [];

    console.log(
      `${ANewFoe.ID} | Getting data for display, revealed stats:`,
      playerStats
    );

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

    return {
      name: this.actor.name,
      img: this.actor.img,
      stats: [
        {
          label: "Hit Points",
          value: this.actor.system.attributes.hp.value,
          key: "hp",
          revealed: playerStats.includes("hp"),
          dc: 12,
        },
        {
          label: "Armor Class",
          value: this.actor.system.attributes.ac.value,
          key: "ac",
          revealed: playerStats.includes("ac"),
          dc: 12,
        },
        {
          label: "Speed",
          value: speed.join(", "),
          key: "speed",
          revealed: playerStats.includes("speed"),
          dc: 10,
        },
        {
          label: "Strength",
          value: `${this.actor.system.abilities.str.value} (${this._getModifier(
            this.actor.system.abilities.str.mod
          )})`,
          key: "str",
          revealed: playerStats.includes("str"),
          dc: 15,
        },
        {
          label: "Dexterity",
          value: `${this.actor.system.abilities.dex.value} (${this._getModifier(
            this.actor.system.abilities.dex.mod
          )})`,
          key: "dex",
          revealed: playerStats.includes("dex"),
          dc: 15,
        },
        {
          label: "Constitution",
          value: `${this.actor.system.abilities.con.value} (${this._getModifier(
            this.actor.system.abilities.con.mod
          )})`,
          key: "con",
          revealed: playerStats.includes("con"),
          dc: 15,
        },
        {
          label: "Intelligence",
          value: `${this.actor.system.abilities.int.value} (${this._getModifier(
            this.actor.system.abilities.int.mod
          )})`,
          key: "int",
          revealed: playerStats.includes("int"),
          dc: 15,
        },
        {
          label: "Wisdom",
          value: `${this.actor.system.abilities.wis.value} (${this._getModifier(
            this.actor.system.abilities.wis.mod
          )})`,
          key: "wis",
          revealed: playerStats.includes("wis"),
          dc: 15,
        },
        {
          label: "Charisma",
          value: `${this.actor.system.abilities.cha.value} (${this._getModifier(
            this.actor.system.abilities.cha.mod
          )})`,
          key: "cha",
          revealed: playerStats.includes("cha"),
          dc: 15,
        },
      ],
    };
  }

  _getModifier(mod) {
    return mod >= 0 ? `+${mod}` : mod.toString();
  }

  async getPlayerModifier(ability) {
    try {
      const userId = game.user.id;
      console.log(
        `${ANewFoe.ID} | Getting modifier for ${ability}, user:`,
        userId
      );

      // Find character owned by this player
      const playerActor = game.actors.find((actor) => {
        const isCharacter = actor.type === "character";
        const isOwned =
          actor.ownership[userId] === CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;
        console.log(`${ANewFoe.ID} | Checking actor:`, {
          name: actor.name,
          type: actor.type,
          isCharacter,
          ownership: actor.ownership,
          isOwned,
        });
        return isCharacter && isOwned;
      });

      if (!playerActor) {
        console.log(
          `${ANewFoe.ID} | No owned character found for user ${userId}`
        );
        return 0;
      }

      console.log(`${ANewFoe.ID} | Found character:`, playerActor.name);
      const modifier = playerActor.system.abilities[ability].mod;
      console.log(
        `${ANewFoe.ID} | Found ${ability} modifier:`,
        modifier,
        "for character:",
        playerActor.name
      );
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

        console.log(`${ANewFoe.ID} | Attempting stat roll for ${key}`);

        let rollFormula = "1d20";
        const usePlayerStats = game.settings.get(ANewFoe.ID, "usePlayerStats");
        console.log(
          `${ANewFoe.ID} | Use player stats setting:`,
          usePlayerStats
        );

        if (usePlayerStats && MonsterInfoDisplay.isAbilityCheck(key)) {
          // Changed to static call
          const modifier = await this.getPlayerModifier(key);
          if (modifier !== 0) {
            rollFormula = `1d20 + ${modifier}`;
          }
          console.log(
            `${ANewFoe.ID} | Roll formula with modifier: ${rollFormula}`
          );
        }

        const roll = new Roll(rollFormula);
        await roll.evaluate();

        console.log(`${ANewFoe.ID} | Roll result:`, {
          formula: roll.formula,
          total: roll.total,
          dc: dc,
        });

        let rollMessage = `Attempting to discern ${key.toUpperCase()}...`;
        if (usePlayerStats && MonsterInfoDisplay.isAbilityCheck(key)) {
          rollMessage += ` (${key.toUpperCase()} Check with ${roll.formula})`;
        }

        await ChatMessage.create({
          flavor: rollMessage,
          speaker: ChatMessage.getSpeaker(),
          rolls: [roll],
          sound: CONFIG.sounds.dice,
        });

        if (roll.total >= dc) {
          const socketData = {
            type: "revealStat",
            userId: game.user.id,
            actorId: this.token.document.getFlag(ANewFoe.ID, "actorId"),
            key: key,
          };

          console.log(
            `${ANewFoe.ID} | Roll succeeded (${roll.total}), sending:`,
            socketData
          );
          game.socket.emit(`module.${ANewFoe.ID}`, socketData);
        } else {
          console.log(`${ANewFoe.ID} | Roll failed (${roll.total})`);
          ChatMessage.create({
            content: `Failed to discern the creature's ${key.toUpperCase()}.`,
            speaker: ChatMessage.getSpeaker(),
          });
        }
      } catch (error) {
        console.error(`${ANewFoe.ID} | Error in stat roll:`, error);
      }
    });
  }

  static isAbilityCheck(key) {
    const isAbility = ["str", "dex", "con", "int", "wis", "cha"].includes(key);
    console.log(`${ANewFoe.ID} | Is ability check for ${key}:`, isAbility);
    return isAbility;
  }

  async refresh() {
    console.log(`${ANewFoe.ID} | Refreshing monster info display`);
    await this.render(true);
  }

  setPosition(options = {}) {
    if (!this.element) return;

    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return super.setPosition(options);

    const sidebarWidth = sidebar.offsetWidth;
    let savedPostion = game.settings.get(ANewFoe.ID, "infoDisplayPosition");
    const position = savedPostion || {
      left: window.innerWidth - sidebarWidth - this.options.width - 5,
      top: window.innerHeight - this.options.height - 5,
    };

    // game.settings.set(ANewFoe.ID, "infoDisplayPosition", position);

    return super.setPosition(foundry.utils.mergeObject(options, position));
  }

  async close(options = {}) {
    if (MonsterInfoDisplay.instance === this) {
      MonsterInfoDisplay.instance = null;
    }

    //set the position to the current position of the window
    const position = this.position;
    game.settings.set(ANewFoe.ID, "infoDisplayPosition", position);

    return super.close(options);
  }

  async _render(force = false, options = {}) {
    console.log(`${ANewFoe.ID} | Rendering display with force=${force}`);
    await super._render(force, options);
    this.setPosition();
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

  static initialize() {
    console.log(`${this.ID} | Starting module initialization`);
    this.registerSettings();
    this.registerHooks();
    this.setupSocket();
    console.log(`${this.ID} | Module initialization complete`);
  }

  static setupSocket() {
    const socketName = `module.${this.ID}`;
    console.log(`${this.ID} | Setting up socket on ${socketName}`);

    // Remove any existing listeners to prevent duplicates
    game.socket.off(socketName);

    game.socket.on(socketName, async (data, ack) => {
      console.log(`${this.ID} | Socket message received:`, data);
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

      await token.document.setFlag(this.ID, this.FLAGS.REVEALED, true);
      await token.document.setFlag(this.ID, this.FLAGS.REVEALED_TO, [
        data.userId,
      ]);
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
        console.log(
          `${this.ID} | Skipping duplicate reveal handling for ${messageKey}`
        );
        return;
      }

      this.DEBOUNCE.lastReveal[messageKey] = now;
      console.log(`${this.ID} | Processing stat revealed for player`);

      // Check if we've sent a chat message recently
      if (
        !this.DEBOUNCE.lastChat[messageKey] ||
        now - this.DEBOUNCE.lastChat[messageKey] > this.DEBOUNCE.TIMEOUT
      ) {
        this.DEBOUNCE.lastChat[messageKey] = now;
        await ChatMessage.create({
          content: `Success! You've discovered the creature's ${data.key.toUpperCase()}!`,
          speaker: ChatMessage.getSpeaker(),
        });
      }

      if (MonsterInfoDisplay.instance) {
        console.log(`${this.ID} | Refreshing display after stat reveal`);
        await MonsterInfoDisplay.instance.refresh();
      }
    } catch (error) {
      console.error(`${this.ID} | Error handling stat revealed:`, error);
    }
  }

  static async handleStatReveal(data) {
    if (!game.user.isGM) return;

    try {
      console.log(`${this.ID} | GM processing stat reveal`);
      const revealedStats = game.settings.get(this.ID, "revealedStats") || {};
      const statKey = `${data.userId}.${data.actorId}`;

      if (!revealedStats[statKey]) {
        revealedStats[statKey] = [];
      }

      if (!revealedStats[statKey].includes(data.key)) {
        revealedStats[statKey].push(data.key);
        await game.settings.set(this.ID, "revealedStats", revealedStats);
        console.log(`${this.ID} | Updated revealed stats:`, revealedStats);

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

  static registerSettings() {
    console.log(`${this.ID} | Registering settings`);

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
  }

  static registerHooks() {
    // Store original data when GM creates token
    Hooks.on("preCreateToken", (document, data, options, userId) => {
      if (game.user.isGM) {
        console.log(
          `${this.ID} | Storing original token data for`,
          document.name
        );
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
        console.log(`${this.ID} | Processing new token`, document.name);
        const token = document.object;
        const actorId = document.getFlag(this.ID, "actorId");

        // Check if this monster type is already learned
        const learnedMonsters =
          game.settings.get(this.ID, "learnedMonsters") || {};
        const isLearned = learnedMonsters[game.user.id]?.includes(actorId);

        if (isLearned) {
          console.log(
            `${this.ID} | Monster type is learned, requesting flag update`
          );
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
          console.log(
            `${this.ID} | Monster is known or revealed, making clickable`
          );
          ANewFoe._makeTokenClickable(token);
        } else {
          console.log(`${this.ID} | New unknown monster, applying silhouette`);
          ANewFoe._processTokenVisibility(token);
        }
      }
    });

    // Handle canvas ready
    Hooks.on("canvasReady", async () => {
      if (!game.user.isGM) {
        console.log(`${this.ID} | Canvas ready, processing tokens`);

        for (const token of canvas.tokens.placeables) {
          if (
            !token.document?.flags ||
            !token.document.getFlag(this.ID, "actorId")
          ) {
            continue;
          }

          const isKnown = ANewFoe.isMonsterTypeKnown(token.document);
          const isRevealed = ANewFoe.isMonsterRevealed(token.document);

          if (isKnown || isRevealed) {
            await ANewFoe._restoreTokenAppearance(token);
            ANewFoe._makeTokenClickable(token);
          } else {
            await ANewFoe._processTokenVisibility(token);
          }
        }
      } else {
        // GM-side overlay updates
        canvas.tokens.placeables.forEach((token) => {
          if (token?.document?.flags) {
            ANewFoe.updateTokenOverlay(token);
          }
        });
      }
    });

    // Handle refreshToken
    Hooks.on("refreshToken", async (token) => {
      if (!game.user.isGM) {
        console.log(`${this.ID} | Refreshing token, processing visibility`);

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
      }
    });

    // Enhance the updateToken hook
    Hooks.on("updateToken", async (document, changes, options, userId) => {
      const token = document.object;
      if (!game.user.isGM && token) {
        // Check if this update includes a hidden state change
        if (changes.hasOwnProperty("hidden")) {
          console.log(`${this.ID} | Token visibility changed for`, token.name);

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
          console.log(`${this.ID} | Token visibility changed for`, token.name);

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

    // Add reveal button to token HUD for GMs
    Hooks.on("renderTokenHUD", (app, html, data) => {
      if (game.user.isGM) {
        const token = app.object;
        const revealBtn = $(`
        <div class="control-icon reveal-monster" title="Reveal Monster">
          <i class="fas fa-eye"></i>
        </div>
      `);
        revealBtn.click((e) => ANewFoe.showRevealDialog(token));
        html.find(".col.right").append(revealBtn);
      }
    });

    Hooks.once("ready", () => {
      console.log(`${this.ID} | Module ready as ${game.user.name}`);
      // No socket registration needed here anymore
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
  }

  static _makeTokenClickable(token) {
    console.log(`${this.ID} | Making token clickable:`, token.name);

    // Enable interaction
    token.interactive = true;
    token.buttonMode = true;

    // Set up click handling
    if (token.mouseInteractionManager) {
      console.log(`${this.ID} | Configuring mouse interaction for`, token.name);

      // Add click handler directly
      token.mouseInteractionManager.permissions.clickLeft = true;
      token.mouseInteractionManager.callbacks = {
        clickLeft: () => {
          console.log(`${this.ID} | Token clicked:`, token.name);
          ANewFoe.showTokenInfo(token);
        },
      };
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
    if (this.OPERATIONS.PROCESSING_VISIBILITY) return;
    this.OPERATIONS.PROCESSING_VISIBILITY = true;

    try {
      if (!token.document.hidden) {
        // Temporarily hide the token during the transition
        token.alpha = 0;

        // Check if this is a reveal from hidden state
        const isReveal = token.document._source?.hidden === true;

        if (isReveal) {
          // Use animated overlay only for reveals
          ANewFoe._createAnimatedOverlay(token);

          // Remove overlay and apply silhouette after animation
          setTimeout(() => {
            ANewFoe._removeBlackOverlay(token);
            // Apply silhouette effect to token
            if (token.mesh) {
              token.mesh.tint = 0x000000;
              token.mesh.alpha = 1;
            }
            // Restore token visibility
            token.alpha = 1;
          }, 1000);
        } else {
          // For regular movement, just ensure silhouette is applied
          if (token.mesh) {
            token.mesh.tint = 0x000000;
            token.mesh.alpha = 1;
          }
          // Restore token visibility
          token.alpha = 1;
        }

        // Block visibility animation
        if (token._animation) token._animation.kill();
        if (token._alphaTransition) token._alphaTransition.kill();

        // Apply visual changes locally
        const originalImage = token.document.getFlag(this.ID, "originalImage");
        if (originalImage && token.mesh) {
          const texture = await loadTexture(originalImage);
          token.mesh.texture = texture;
        }

        // Update text display locally
        if (token.text) {
          token.text.text = "Unknown Creature";
          token.text.visible = true;
          token.text.alpha = 1;
          token.text.draw();
        }

        // Ensure the token is non-interactive for players
        if (!game.user.isGM) {
          token.interactive = false;
          token.buttonMode = false;
        }
      }
    } catch (error) {
      console.error(`${this.ID} | Error processing token visibility:`, error);
      ANewFoe._removeBlackOverlay(token);
      // Restore token visibility in case of error
      token.alpha = 1;
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
    console.log(`${this.ID} | Attempting to show token info for:`, token.name);

    if (!ANewFoe.isMonsterRevealed(token.document)) {
      console.log(`${this.ID} | Token not revealed, skipping info display`);
      return;
    }

    try {
      // If same window exists, bring to front
      if (MonsterInfoDisplay.instance?.token.id === token.id) {
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
      console.log(`${this.ID} | Monster info display rendered`);
    } catch (error) {
      console.error(`${this.ID} | Error showing token info:`, error);
    }
  }

  // GM overlay system
  static async updateTokenOverlay(token) {
    if (!game.user.isGM || !token?.document?.flags) return;

    try {
      // Clean up existing overlay safely
      if (token.revealOverlay) {
        if (
          token.revealOverlay.destroy &&
          typeof token.revealOverlay.destroy === "function"
        ) {
          token.revealOverlay.destroy({ children: true });
        } else {
          token.removeChild(token.revealOverlay);
        }
        token.revealOverlay = null;
      }

      const players = game.users.filter((u) => !u.isGM);
      if (players.length === 0) return;

      // Calculate how many players know this monster
      const knownCount = players.reduce((count, player) => {
        const actorId = token.document.getFlag(this.ID, "actorId");
        const learnedMonsters =
          game.settings.get(this.ID, "learnedMonsters") || {};
        const revealedTo =
          token.document.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];

        const knows =
          learnedMonsters[player.id]?.includes(actorId) ||
          revealedTo.includes(player.id);

        return count + (knows ? 1 : 0);
      }, 0);

      if (knownCount >= players.length) return; // All players know it

      // Create new overlay
      const overlay = new PIXI.Graphics();
      const color = knownCount === 0 ? 0xff0000 : 0xffa500;

      overlay.lineStyle(3, color, 0.8);
      overlay.drawRoundedRect(0, 0, token.w, token.h, 5);

      const radius = Math.min(token.w, token.h) * 0.15;
      overlay.beginFill(color, 0.8);
      overlay.drawCircle(radius, radius, radius);
      overlay.endFill();

      if (knownCount > 0) {
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
    } catch (error) {
      console.error(`${this.ID} | Error updating token overlay:`, error);
    }
  }

  static async revealMonster(token, selectedPlayerIds) {
    console.log(`${this.ID} | Starting reveal process`);

    try {
      const tokenDocument = token.document;
      const actorId = tokenDocument.getFlag(this.ID, "actorId");
      const currentlyRevealedTo =
        tokenDocument.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];

      // Find all tokens of the same type
      const sameTypeTokens = canvas.tokens.placeables.filter(
        (t) => t.document.getFlag(this.ID, "actorId") === actorId
      );

      // Handle reveals and unreveals
      const playersToReveal = selectedPlayerIds.filter(
        (id) => !currentlyRevealedTo.includes(id)
      );
      const playersToUnreveal = currentlyRevealedTo.filter(
        (id) => !selectedPlayerIds.includes(id)
      );

      // Process all player changes before updating tokens
      const promises = [];
      for (const playerId of playersToReveal) {
        promises.push(ANewFoe.learnMonsterType(tokenDocument, playerId));
      }
      for (const playerId of playersToUnreveal) {
        promises.push(ANewFoe.unlearnMonsterType(tokenDocument, playerId));
      }
      await Promise.all(promises);

      // Update each token's reveal state and appearance
      for (const currentToken of sameTypeTokens) {
        const currentDoc = currentToken.document;

        // Update reveal flags
        await currentDoc.setFlag(
          this.ID,
          this.FLAGS.REVEALED,
          selectedPlayerIds.length > 0
        );
        await currentDoc.setFlag(
          this.ID,
          this.FLAGS.REVEALED_TO,
          selectedPlayerIds
        );

        // Update token appearance
        if (game.user.isGM) {
          await ANewFoe.updateTokenOverlay(currentToken);
        }
      }

      // Update actor permissions
      if (token.actor) {
        const updates = {
          "permission.default": CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED,
        };

        // Reset permissions for unrevealed players
        for (const playerId of playersToUnreveal) {
          updates[`permission.${playerId}`] =
            CONST.DOCUMENT_OWNERSHIP_LEVELS.LIMITED;
        }

        // Set permissions for revealed players
        for (const playerId of selectedPlayerIds) {
          updates[`permission.${playerId}`] =
            CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER;
        }

        await token.actor.update(updates);
      }

      // Send notifications
      if (playersToReveal.length > 0) {
        await ChatMessage.create({
          content: `${sameTypeTokens.length} creature${
            sameTypeTokens.length > 1 ? "s have" : " has"
          } been revealed to you.`,
          whisper: playersToReveal,
          speaker: ChatMessage.getSpeaker({ alias: "System" }),
        });
      }

      if (playersToUnreveal.length > 0) {
        await ChatMessage.create({
          content: `${sameTypeTokens.length} creature${
            sameTypeTokens.length > 1 ? "s have" : " has"
          } been hidden from you.`,
          whisper: playersToUnreveal,
          speaker: ChatMessage.getSpeaker({ alias: "System" }),
        });
      }

      // Force scene refresh for affected players
      const affectedPlayers = [
        ...new Set([...playersToReveal, ...playersToUnreveal]),
      ];
      game.socket.emit(`module.${this.ID}`, {
        type: "refreshScene",
        playerIds: affectedPlayers,
      });

      // Update all token overlays
      if (game.user.isGM) {
        for (const token of sameTypeTokens) {
          await ANewFoe.updateTokenOverlay(token);
        }
      }
    } catch (error) {
      console.error(`${this.ID} | Error in reveal monster:`, error);
    }
  }

  static async showRevealDialog(token) {
    console.log(`${this.ID} | Showing reveal dialog for`, token.name);

    const actorId = token.document.getFlag(this.ID, "actorId");
    const learnedMonsters = game.settings.get(this.ID, "learnedMonsters") || {};
    const revealedTo =
      token.document.getFlag(this.ID, this.FLAGS.REVEALED_TO) || [];

    const content = await renderTemplate(this.TEMPLATES.REVEAL_DIALOG, {
      img: token.document.texture.src,
      name: token.name,
      players: game.users
        .filter((u) => !u.isGM)
        .map((u) => ({
          id: u.id,
          name: u.name,
          known:
            learnedMonsters[u.id]?.includes(actorId) ||
            revealedTo.includes(u.id),
        })),
    });

    new Dialog(
      {
        title: "Reveal Monster",
        content: content,
        buttons: {
          reveal: {
            icon: '<i class="fas fa-eye"></i>',
            label: "Reveal",
            callback: async (html) => {
              const selectedPlayers = html
                .find("input:checked")
                .map((i, el) => el.value)
                .get();
              await ANewFoe.revealMonster(token, selectedPlayers);
            },
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
          },
        },
        default: "reveal",
        classes: ["reveal-monster-dialog", "app"], // Add 'app' class here
      },
      {
        id: "reveal-monster-dialog", // Add unique ID
        classes: ["reveal-monster-window"], // Add additional class for the window
      }
    ).render(true);
  }

  static async learnMonsterType(tokenDocument, userId) {
    const actorId = tokenDocument.getFlag(this.ID, "actorId");
    if (!actorId) return;

    const learnedMonsters = game.settings.get(this.ID, "learnedMonsters") || {};
    learnedMonsters[userId] = learnedMonsters[userId] || [];

    if (!learnedMonsters[userId].includes(actorId)) {
      learnedMonsters[userId].push(actorId);
      await game.settings.set(this.ID, "learnedMonsters", learnedMonsters);
      console.log(
        `${this.ID} | Added monster ${actorId} to learned list for user ${userId}`
      );
    }
  }

  static async unlearnMonsterType(tokenDocument, userId) {
    const actorId = tokenDocument.getFlag(this.ID, "actorId");
    if (!actorId) return;

    const learnedMonsters = game.settings.get(this.ID, "learnedMonsters") || {};
    if (learnedMonsters[userId]) {
      learnedMonsters[userId] = learnedMonsters[userId].filter(
        (id) => id !== actorId
      );
      await game.settings.set(this.ID, "learnedMonsters", learnedMonsters);

      // Clear revealed stats for this monster
      const revealedStats = game.settings.get(this.ID, "revealedStats") || {};
      const statKey = `${userId}.${actorId}`;
      if (revealedStats[statKey]) {
        delete revealedStats[statKey];
        await game.settings.set(this.ID, "revealedStats", revealedStats);
      }

      console.log(
        `${this.ID} | Removed monster ${actorId} from learned list for user ${userId}`
      );
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
}

// Module Initialization
Hooks.once("init", () => {
  CONFIG.debug.hooks = true;
  console.log(`${ANewFoe.ID} | Initializing module`);
  ANewFoe.initialize();
});
