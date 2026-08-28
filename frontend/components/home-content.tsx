import Image from "next/image";
import { connection } from "next/server";
import { getHomeData } from "@/lib/home-data";
import type {
  HomeData,
  PropertyContentRow,
  PropertyRow,
  PublicPropertyMedia,
  ReviewRow,
} from "@/types/home";
import styles from "@/app/page.module.css";

const LOCAL_HERO = "/images/la-casilla/hero-terrassa.webp";

const LOCAL_GALLERY = [
  {
    src: "/images/la-casilla/exterior-vespre.webp",
    alt: "Exterior de La Casilla al capvespre",
    caption: "Capvespres per viure sense presses",
  },
  {
    src: "/images/la-casilla/pati-exterior.webp",
    alt: "Pati exterior de La Casilla",
    caption: "Racons per gaudir de l’aire lliure",
  },
  {
    src: "/images/la-casilla/interior-casa.webp",
    alt: "Interior càlid i lluminós de La Casilla",
    caption: "Espais amb caràcter propi",
  },
] as const;

function plural(value: number, singular: string, pluralForm: string): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

function formatPrice(property: PropertyRow): string {
  return new Intl.NumberFormat("ca-ES", {
    style: "currency",
    currency: property.currency,
    maximumFractionDigits: 0,
  }).format(property.base_nightly_price);
}

function formatTime(value: string): string {
  return `${value.slice(0, 5).replace(":", ".")} h`;
}

function formatAmenity(value: string): string {
  const label = value.replaceAll("_", " ").trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : value;
}

function reviewDate(value: string | null): string | null {
  if (!value) return null;

  return new Intl.DateTimeFormat("ca-ES", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function PropertyOverview({
  property,
  content,
}: {
  property: PropertyRow | null;
  content: PropertyContentRow | null;
}) {
  const facts = property && content
    ? [
        { label: "Capacitat", value: plural(property.max_guests, "hoste", "hostes") },
        { label: "Habitacions", value: plural(content.bedrooms, "habitació", "habitacions") },
        { label: "Banys", value: plural(content.bathrooms, "bany", "banys") },
        { label: "Des de", value: `${formatPrice(property)} / nit` },
      ]
    : [];

  return (
    <section className={styles.discovery} id="descobrir" aria-labelledby="discovery-title">
      <div className={styles.storyGrid}>
        <div className={styles.storyCopy}>
          <p className={styles.eyebrow}>La casa</p>
          <h2 id="discovery-title">Una manera tranquil·la de viure cada dia.</h2>
          <p>
            Pedra, llum i natura conviuen en una casa pensada per compartir, descansar i
            tornar a gaudir de les coses senzilles.
          </p>
        </div>
        <div className={styles.storyImage}>
          <Image
            src="/images/la-casilla/exterior-casa.webp"
            alt="Exterior de La Casilla entre arbres i jardí"
            fill
            sizes="(max-width: 860px) 100vw, 50vw"
          />
        </div>
      </div>

      {property && content && (
        <>
          <div className={styles.facts}>
            {facts.map((fact) => (
              <div className={styles.fact} key={fact.label}>
                <span>{fact.label}</span>
                <strong>{fact.value}</strong>
              </div>
            ))}
          </div>
          <div className={styles.stayDetails}>
            <p>
              Arribada a partir de <strong>{formatTime(content.check_in_time)}</strong>
            </p>
            <p>
              Sortida abans de <strong>{formatTime(content.check_out_time)}</strong>
            </p>
            <p>
              Estada mínima: <strong>{plural(property.base_minimum_nights, "nit", "nits")}</strong>
            </p>
          </div>
        </>
      )}
      {content && content.amenities.length > 0 && (
        <div className={styles.amenities}>
          <h3>Equipaments</h3>
          <ul>
            {content.amenities.map((amenity) => (
              <li key={amenity}>{formatAmenity(amenity)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function OutdoorMoment() {
  return (
    <section className={styles.immersive} aria-labelledby="outdoor-title">
      <Image src="/images/la-casilla/jardi-terrassa.webp" alt="" fill sizes="100vw" />
      <div className={styles.immersiveOverlay} />
      <div className={styles.immersiveContent}>
        <p className={styles.eyebrow}>A l’aire lliure</p>
        <h2 id="outdoor-title">Dies sense presses, envoltats de natura.</h2>
        <p>
          Esmorzars llargs, sobretaules al jardí i capvespres que conviden a quedar-s’hi una
          estona més.
        </p>
      </div>
    </section>
  );
}

function Rooms() {
  const rooms = [
    {
      src: "/images/la-casilla/habitacio-lluminosa.webp",
      alt: "Habitació lluminosa de La Casilla",
      caption: "Llum natural",
    },
    {
      src: "/images/la-casilla/habitacio-acollidora.webp",
      alt: "Habitació acollidora de La Casilla",
      caption: "Calma i confort",
    },
    {
      src: "/images/la-casilla/habitacio-calida.webp",
      alt: "Habitació càlida amb detalls de fusta a La Casilla",
      caption: "Materials amb ànima",
    },
  ] as const;

  return (
    <section className={styles.dataSection} aria-labelledby="rooms-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Descans</p>
        <h2 id="rooms-title">Espais per sentir-vos com a casa.</h2>
      </div>
      <div className={styles.roomGrid}>
        {rooms.map((room, index) => (
          <figure className={index === 0 ? styles.roomCardLarge : styles.roomCard} key={room.src}>
            <Image src={room.src} alt={room.alt} fill sizes="(max-width: 680px) 100vw, 50vw" />
            <figcaption>{room.caption}</figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

function MediaGallery({ media }: { media: PublicPropertyMedia[] }) {
  return (
    <section className={styles.dataSection} aria-labelledby="media-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>En imatges</p>
        <h2 id="media-title">La casa, des de tots els angles.</h2>
      </div>
      <div className={styles.mediaGrid}>
        {media.length > 0
          ? media.map((item) => (
              <figure className={styles.mediaCard} key={item.id}>
                <div
                  className={styles.mediaImage}
                  style={{ backgroundImage: `url("${item.url}")` }}
                  role="img"
                  aria-label={item.alt_text}
                />
                {item.caption && <figcaption>{item.caption}</figcaption>}
              </figure>
            ))
          : LOCAL_GALLERY.map((item) => (
              <figure className={styles.mediaCard} key={item.src}>
                <div className={styles.mediaImageFrame}>
                  <Image src={item.src} alt={item.alt} fill sizes="(max-width: 680px) 100vw, 50vw" />
                </div>
                <figcaption>{item.caption}</figcaption>
              </figure>
            ))}
      </div>
    </section>
  );
}

function Rating({ value }: { value: number }) {
  const normalized = Math.max(0, Math.min(5, Math.round(value)));

  return (
    <span className={styles.rating} role="img" aria-label={`${normalized} estrelles de 5`}>
      {"★".repeat(normalized)}
      <span aria-hidden="true">{"☆".repeat(5 - normalized)}</span>
    </span>
  );
}

function Reviews({ reviews }: { reviews: ReviewRow[] }) {
  return (
    <section className={styles.dataSection} aria-labelledby="reviews-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>Han estat aquí</p>
        <h2 id="reviews-title">Records que es comparteixen.</h2>
      </div>
      {reviews.length > 0 ? (
        <div className={styles.reviewGrid}>
          {reviews.map((review) => {
            const date = reviewDate(review.stay_month);
            return (
              <article className={styles.review} key={review.id}>
                <Rating value={review.rating} />
                <blockquote>“{review.comment}”</blockquote>
                <footer>
                  <strong>{review.display_name}</strong>
                  {(date || review.source) && (
                    <span>{[date, review.source].filter(Boolean).join(" · ")}</span>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <p className={styles.inlineEmpty}>Encara no hi ha cap ressenya publicada.</p>
      )}
    </section>
  );
}

export function HomeLoading() {
  return (
    <section className={styles.loadingPanel} aria-busy="true" aria-label="Carregant La Casilla">
      <div className={styles.loadingContent}>
        <span className={styles.loadingLine} />
        <span className={styles.loadingTitle} />
        <span className={styles.loadingText} />
        <span className={styles.loadingTextShort} />
      </div>
    </section>
  );
}

interface HomeLoadResult {
  data: HomeData;
  failed: boolean;
}

async function loadHomeData(): Promise<HomeLoadResult> {
  try {
    return { data: await getHomeData(), failed: false };
  } catch (error) {
    console.error("No s’han pogut carregar les dades públiques de la portada.", error);
    return {
      data: { property: null, content: null, media: [], reviews: [] },
      failed: true,
    };
  }
}

export async function HomeContent() {
  await connection();
  const { data, failed } = await loadHomeData();
  const { property, content, media, reviews } = data;
  const heroMedia = media[0];
  const title = content?.name ?? "La Casilla";
  const description = content?.description
    ?? "Una casa acollidora per aturar-vos, retrobar-vos i gaudir del moment.";
  const limitedData = failed || !property || !content;

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroBackdrop} aria-hidden="true">
          {heroMedia ? (
            <div
              className={styles.heroRemoteImage}
              style={{ backgroundImage: `url("${heroMedia.url}")` }}
            />
          ) : (
            <Image src={LOCAL_HERO} alt="" fill priority sizes="100vw" />
          )}
        </div>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>Casa sencera · Natura · Calma</p>
          <h1 id="hero-title">{title}</h1>
          <p className={styles.lead}>{description}</p>
          <a className={styles.primaryAction} href="#descobrir">
            Descobriu la casa
          </a>
        </div>
      </section>

      {limitedData && (
        <p className={styles.dataNotice} role="status">
          {failed
            ? "Algunes dades de la casa no estan disponibles ara mateix. Les tornarem a mostrar tan aviat com sigui possible."
            : "Estem acabant de preparar la informació detallada de la casa."}
        </p>
      )}

      <PropertyOverview property={property} content={content} />
      <OutdoorMoment />
      <Rooms />
      <MediaGallery media={media} />
      <Reviews reviews={reviews} />

      <section className={styles.nextStep} aria-labelledby="next-step-title">
        <Image src="/images/la-casilla/facana-vegetacio.webp" alt="" fill sizes="100vw" />
        <div className={styles.nextStepOverlay} />
        <div className={styles.nextStepContent}>
          <p className={styles.eyebrow}>La vostra estada</p>
          <h2 id="next-step-title">Prepareu uns dies per recordar.</h2>
          <p>
            Ben aviat podreu consultar la disponibilitat, demanar pressupost i preparar la reserva.
          </p>
        </div>
      </section>
    </>
  );
}
