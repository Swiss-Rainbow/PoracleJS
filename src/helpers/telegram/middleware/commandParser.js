const { mount } = require('telegraf')

const regex = /^\/([^@\s]+)@?(?:(\S+)|)\s?([\s\S]*)$/i

/* eslint no-param-reassign: ["error", { "props": false }] */
module.exports = () => mount('text', (ctx, next) => {
    console.dir(ctx, {depth: null, colors: true})
    if (ctx.channel_post) {
        
        ctx.message = ctx.channel_post;
    }
	if (!ctx.message) return next()
	const parts = regex.exec(ctx.message.text)
	if (!parts) return next()
	const command = {
		text: ctx.message.text,
		command: parts[1],
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
