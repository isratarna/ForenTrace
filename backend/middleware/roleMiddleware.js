export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const user = req.session?.user

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      })
    }

    if (!allowedRoles.includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied.',
      })
    }

    next()
  }
}