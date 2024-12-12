activateListeners(html) {
    super.activateListeners(html);

    html.find(".stat-roll").click(async (event) => {
      try {
        const button = event.currentTarget;
        const key = button.dataset.key;
        const dc = parseInt(button.dataset.dc);

        console.log(`${ANewFoe.ID} | Attempting stat roll for ${key}`);

        const roll = new Roll("1d20");
        await roll.evaluate();

        await ChatMessage.create({
          flavor: `Attempting to discern ${key.toUpperCase()}...`,
          speaker: ChatMessage.getSpeaker(),
          rolls: [roll],
          sound: CONFIG.sounds.dice
        });

        if (roll.total >= dc) {
          const socketData = {
            type: "revealStat",
            userId: game.user.id,
            actorId: this.token.document.getFlag(ANewFoe.ID, "actorId"),
            key: key
          };
          
          console.log(`${ANewFoe.ID} | Roll succeeded (${roll.total}), sending:`, socketData);
          game.socket.emit(`module.${ANewFoe.ID}`, socketData);
        } else {
          console.log(`${ANewFoe.ID} | Roll failed (${roll.total})`);
          ChatMessage.create({
            content: `Failed to discern the creature's ${key.toUpperCase()}.`,
            speaker: ChatMessage.getSpeaker()
          });
        }
      } catch (error) {
        console.error(`${ANewFoe.ID} | Error in stat roll:`, error);
      }
    });
  }