import { Link, createFileRoute } from '@tanstack/react-router'
import type { AnyRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/document-navigation')({
  component: DocumentNavigation,
})

const adminHref = `http://127.0.0.1:${window.location.port}/external.html`

function DocumentNavigation() {
  const navigate = Route.useNavigate()

  return (
    <div>
      <button onClick={() => navigate({ to: '/document-navigation-target' })}>
        Navigate to admin
      </button>
      <button
        onClick={() =>
          navigate({ to: '/document-navigation-target', replace: true })
        }
      >
        Replace with admin
      </button>
      <button
        onClick={() =>
          navigate({ to: '/document-navigation-target', reloadDocument: true })
        }
      >
        Reload admin
      </button>
      <button
        onClick={() =>
          navigate({
            to: '/',
            mask: { to: '/document-navigation-target' },
          })
        }
      >
        Navigate with external mask
      </button>
      <button
        onClick={() =>
          navigate({
            to: '/',
            mask: { to: '/document-navigation-target' },
            replace: true,
          })
        }
      >
        Replace with external mask
      </button>
      <button
        onClick={() =>
          navigate({
            href: `${adminHref}?value=a+b&value=a%20b#raw%2f`,
          })
        }
      >
        Navigate to absolute href
      </button>
      <button
        onClick={() =>
          navigate({
            href: '../?value=a+b&value=a%20b#raw%2f',
            reloadDocument: true,
          })
        }
      >
        Reload relative href
      </button>
      <Link to="/document-navigation-target">Navigate to admin</Link>
      <Link to="/document-navigation-target" replace>
        Replace with admin
      </Link>
      <Link to="/document-navigation-target" reloadDocument>
        Reload admin
      </Link>
      <Link to="/" mask={{ to: '/document-navigation-target' }}>
        Navigate with external mask
      </Link>
      <Link to="/" mask={{ to: '/document-navigation-target' }} replace>
        Replace with external mask
      </Link>
      <Link<AnyRouter> to={`${adminHref}?value=a+b&value=a%20b#raw%2f`}>
        Navigate to absolute href
      </Link>
      <Link
        from={Route.fullPath}
        href="../?value=a+b&value=a%20b#raw%2f"
        reloadDocument
      >
        Reload relative href
      </Link>
    </div>
  )
}
