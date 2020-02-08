const { mount } = require('telegraf')

const regex = /^\/([^@\s]+)@?(?:(\S+)|)\s?([\s\S]*)$/i

/* eslint no-param-reassign: ["error", { "props": false }] */
module.exports = () => mount('text', (ctx, next) => {
    if (ctx.update.channel_post) {
        
        ctx.update.message = ctx.update.channel_post;
    }
	if (!ctx.update.message) return next()
	const parts = regex.exec(ctx.update.message.text)
	if (!parts) return next()
	const command = {
		text: ctx.update.message.text,
		command: parts[1].toLowerCase(),
		bot: parts[2],
		args: parts[3],
		get splitArgs() {
			const args = parts[3].split(/\s+/)
			return args.map((arg) => arg.toLowerCase().replace(/,*$/, ''))
		},
	}
	ctx.state.command = command
	return next()
})
