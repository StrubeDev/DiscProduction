
export function handleTestCommand(req, res) {
  // Access req.body.member, req.body.guild_id if needed
  const userName = req.body.member.user.username;
  return res.send({
    type: 4, // InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      content: `Hello ${userName}! This is the TEST command, conditionally loaded.`,
    },
  });
}