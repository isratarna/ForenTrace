export function getHealth(request, response) {
  response.status(200).json({
    success: true,
    message: 'ForenTrace API is running.',
  })
}
