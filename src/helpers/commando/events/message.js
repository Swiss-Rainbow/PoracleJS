module.exports = (client, msg) => {
	// Ignore all bots
	if (msg.author.bot) return

	// Ignore msgs not starting with the prefix (in config)
	if (msg.content.indexOf(client.config.discord.prefix) !== 0) return

	let args = msg.content.slice(client.config.discord.prefix.length).trim().split(/ +/g)
	args = args.map((arg) => arg.toLowerCase().replace(/,*$/, ''))

	const command = args.shift().toLowerCase()
	const cmd = client.commands.get(command)
	if (!cmd) {
		if (msg.channel.type !== 'dm') {
			return
		}
		else {
			return msg.reply(`404 COMMAND \`${command}\` NOT FOUND`).catch((O_o) => {
				client.log.error(O_o.message)
			})
		}
	}

	cmd.run(client, msg, args)
}
