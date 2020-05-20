module.exports = (ctx) => {
	const user = ctx.update.message.from || ctx.update.message.chat
	ctx.reply(`Hello ${user.first_name}, Your user ID is '${user.id}'`)
}