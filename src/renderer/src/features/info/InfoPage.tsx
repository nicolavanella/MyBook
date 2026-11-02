import { Scale, Heart, Globe, Github, Mail } from 'lucide-react'
import packageJson from '../../../../../package.json'
import logo from '../../assets/mybook-logo.svg'
import { useTranslation } from '@renderer/i18n/useTranslation'

/**
 * Dati di Credits/Link non ricavabili automaticamente dal codice (nome
 * autore, indirizzi reali). Tenuti in cima al file, isolati dal markup, così
 * sono facili da individuare e sostituire con i valori reali del progetto.
 * TODO: sostituire i placeholder con i dati definitivi.
 */
const AUTHOR_NAME = 'Nicola Vanella'
const CONTACT_EMAIL = ''
const WEBSITE_URL = ''
const REPOSITORY_URL = ''

const TECHNOLOGIES = ['Electron', 'React', 'TypeScript', 'TipTap', 'SQLite (better-sqlite3)']

function InfoSection({
  icon,
  title,
  children
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}): JSX.Element {
  return (
    <section className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
        {icon}
        {title}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  )
}

/** Link esterno aperto nel browser di sistema tramite IPC (mai in una finestra Electron, vedi app.ipc.ts). */
function ExternalLink({ href, children }: { href: string; children: React.ReactNode }): JSX.Element {
  return (
    <button
      type="button"
      onClick={() => window.mybook.app.openExternal(href)}
      className="text-blue-600 hover:underline dark:text-blue-400"
    >
      {children}
    </button>
  )
}

export default function InfoPage(): JSX.Element {
  const { t } = useTranslation()
  const hasLinks = WEBSITE_URL || REPOSITORY_URL || CONTACT_EMAIL

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100">{t('nav.info')}</h1>

      <div className="max-w-md space-y-4">
        <div className="flex items-center gap-4">
          <img src={logo} alt={t('info.logoAlt')} className="h-16 w-16 shrink-0" />
          <div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">MyBook</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('info.version', { version: packageJson.version })}</div>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('info.description')}
        </p>

        <InfoSection icon={<Heart size={16} />} title={t('info.credits')}>
          <div>{t('info.createdBy', { author: AUTHOR_NAME })}</div>
          <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('info.builtWith', { list: TECHNOLOGIES.join(', ') })}
          </div>
        </InfoSection>

        <InfoSection icon={<Scale size={16} />} title={t('info.license')}>
          <p>
            {t('info.licenseBefore')}{' '}
            <span className="font-medium">GNU General Public License v3.0 (GPL-3.0)</span>
            {t('info.licenseAfter')}
          </p>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            {t('info.licenseFileBefore')}{' '}
            <button
              type="button"
              onClick={() => window.mybook.app.openLicense()}
              className="font-mono text-blue-600 hover:underline dark:text-blue-400"
            >
              LICENSE
            </button>{' '}
            {t('info.licenseFileAfter')}
          </p>
        </InfoSection>

        {hasLinks && (
          <InfoSection icon={<Globe size={16} />} title={t('info.links')}>
            <ul className="space-y-1.5">
              {WEBSITE_URL && (
                <li className="flex items-center gap-2">
                  <Globe size={14} className="shrink-0 text-gray-400" />
                  <ExternalLink href={WEBSITE_URL}>{t('info.website')}</ExternalLink>
                </li>
              )}
              {REPOSITORY_URL && (
                <li className="flex items-center gap-2">
                  <Github size={14} className="shrink-0 text-gray-400" />
                  <ExternalLink href={REPOSITORY_URL}>{t('info.sourceCode')}</ExternalLink>
                </li>
              )}
              {CONTACT_EMAIL && (
                <li className="flex items-center gap-2">
                  <Mail size={14} className="shrink-0 text-gray-400" />
                  <ExternalLink href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</ExternalLink>
                </li>
              )}
            </ul>
          </InfoSection>
        )}
      </div>
    </div>
  )
}
