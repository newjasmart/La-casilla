import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { connection } from "next/server";
import { BookingFlow } from "@/components/booking-flow";
import { ContactForm } from "@/components/contact-form";
import { getHomeData } from "@/lib/home-data";
import { formatClockTime, formatMonthYear, formatMoney } from "@/lib/intl-format";
import type {
  HomeData,
  PropertyContentRow,
  PropertyRow,
  PublicPropertyMedia,
  ReviewRow,
} from "@/types/home";
import styles from "@/app/page.module.css";

const LOCAL_HERO = "/images/la-casilla/entrada-casilla.webp";

function formatPrice(property: PropertyRow, locale: string): string {
  return formatMoney(property.base_nightly_price, property.currency, locale, { maximumFractionDigits: 0 });
}

function fallbackLabel(value: string): string {
  const label = value.replaceAll("_", " ").trim();
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : value;
}

/**
 * Returns the locale-specific override for guest-facing free text (property
 * description, review comments) when the owner/guest provided one, falling
 * back to whatever was originally written otherwise. Never throws on an
 * unknown or missing locale.
 */
function localizedText(canonical: string, translations: Record<string, string>, locale: string): string {
  return translations[locale]?.trim() || canonical;
}

function reviewDate(value: string | null, locale: string): string | null {
  return value ? formatMonthYear(value, locale) : null;
}

function PropertyOverview({
  property,
  content,
}: {
  property: PropertyRow | null;
  content: PropertyContentRow | null;
}) {
  const t = useTranslations("Discovery");
  const amenitiesT = useTranslations("Amenities");
  const locale = useLocale();

  const facts = property && content
    ? [
        { label: t("factCapacity"), value: t("guest", { count: property.max_guests }) },
        { label: t("factBedrooms"), value: t("bedroom", { count: content.bedrooms }) },
        { label: t("factBathrooms"), value: t("bathroom", { count: content.bathrooms }) },
        { label: t("factFrom"), value: t("perNight", { price: formatPrice(property, locale) }) },
      ]
    : [];

  return (
    <section className={styles.discovery} id="descobrir" aria-labelledby="discovery-title">
      <div className={styles.storyGrid}>
        <div className={styles.storyCopy}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h2 id="discovery-title">{t("title")}</h2>
          <p>{t("body")}</p>
        </div>
        <div className={styles.storyImage}>
          <Image
            src="/images/la-casilla/vista-aeria-piscina.webp"
            alt={t("heroImageAlt")}
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
              {t("checkInFrom")} <strong>{formatClockTime(content.check_in_time, locale)}</strong>
            </p>
            <p>
              {t("checkOutBefore")} <strong>{formatClockTime(content.check_out_time, locale)}</strong>
            </p>
            <p>
              {t("minStay")} <strong>{t("night", { count: property.base_minimum_nights })}</strong>
            </p>
          </div>
        </>
      )}
      {content && content.amenities.length > 0 && (
        <div className={styles.amenities}>
          <h3>{t("amenitiesTitle")}</h3>
          <ul>
            {content.amenities.map((amenity) => (
              <li key={amenity}>{amenitiesT.has(amenity) ? amenitiesT(amenity) : fallbackLabel(amenity)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function OutdoorMoment() {
  const t = useTranslations("Outdoor");

  return (
    <section className={styles.immersive} aria-labelledby="outdoor-title">
      <Image src="/images/la-casilla/jardi-terrassa.webp" alt="" fill sizes="100vw" />
      <div className={styles.immersiveOverlay} />
      <div className={styles.immersiveContent}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h2 id="outdoor-title">{t("title")}</h2>
        <p>{t("body")}</p>
      </div>
    </section>
  );
}

function Rooms() {
  const t = useTranslations("Rooms");

  const rooms = [
    {
      src: "/images/la-casilla/habitacio-jardi.webp",
      alt: t("gardenAlt"),
      caption: t("gardenCaption"),
    },
    {
      src: "/images/la-casilla/habitacio-muntanya.webp",
      alt: t("mountainAlt"),
      caption: t("mountainCaption"),
    },
    {
      src: "/images/la-casilla/habitacio-lliteres.webp",
      alt: t("bunkAlt"),
      caption: t("bunkCaption"),
    },
  ] as const;

  return (
    <section className={styles.dataSection} aria-labelledby="rooms-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h2 id="rooms-title">{t("title")}</h2>
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
  const t = useTranslations("Gallery");

  const localGallery = [
    { src: "/images/la-casilla/cuina.webp", alt: t("kitchenAlt"), caption: t("kitchenCaption") },
    { src: "/images/la-casilla/sala-estar.webp", alt: t("livingAlt"), caption: t("livingCaption") },
    { src: "/images/la-casilla/piscina-capvespre.webp", alt: t("poolAlt"), caption: t("poolCaption") },
    { src: "/images/la-casilla/bany-principal.webp", alt: t("bathroomMainAlt"), caption: t("bathroomMainCaption") },
    { src: "/images/la-casilla/bany-secundari.webp", alt: t("bathroomSecondaryAlt"), caption: t("bathroomSecondaryCaption") },
    { src: "/images/la-casilla/detall-fusta.webp", alt: t("woodDetailAlt"), caption: t("woodDetailCaption") },
  ] as const;

  return (
    <section className={styles.dataSection} id="fotos" aria-labelledby="media-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h2 id="media-title">{t("title")}</h2>
      </div>
      <div className={styles.mediaGrid}>
        {media.length > 0
          ? media.map((item) => (
              <figure className={styles.mediaCard} key={item.id}>
                <div className={styles.mediaImageFrame}>
                  <Image src={item.url} alt={item.alt_text} fill sizes="(max-width: 680px) 100vw, 50vw" />
                </div>
                {item.caption && <figcaption>{item.caption}</figcaption>}
              </figure>
            ))
          : localGallery.map((item) => (
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

function Rating({ value, ariaLabel }: { value: number; ariaLabel: string }) {
  const normalized = Math.max(0, Math.min(5, Math.round(value)));

  return (
    <span className={styles.rating} role="img" aria-label={ariaLabel}>
      {"★".repeat(normalized)}
      <span aria-hidden="true">{"☆".repeat(5 - normalized)}</span>
    </span>
  );
}

function Reviews({ reviews }: { reviews: ReviewRow[] }) {
  const t = useTranslations("Reviews");
  const locale = useLocale();

  return (
    <section className={styles.dataSection} aria-labelledby="reviews-title">
      <div className={styles.sectionHeading}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h2 id="reviews-title">{t("title")}</h2>
      </div>
      {reviews.length > 0 ? (
        <div className={styles.reviewGrid}>
          {reviews.map((review) => {
            const date = reviewDate(review.stay_month, locale);
            const comment = localizedText(review.comment, review.comment_translations, locale);
            return (
              <article className={styles.review} key={review.id}>
                <Rating value={review.rating} ariaLabel={t("ratingAria", { count: review.rating })} />
                <blockquote>“{comment}”</blockquote>
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
        <p className={styles.inlineEmpty}>{t("empty")}</p>
      )}
    </section>
  );
}

export function HomeLoading() {
  const t = useTranslations("Loading");

  return (
    <section className={styles.loadingPanel} aria-busy="true" aria-label={t("aria")}>
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
  const locale = await getLocale();
  const t = await getTranslations("Hero");
  const dataNoticeT = await getTranslations("DataNotice");
  const title = content?.name ?? t("defaultTitle");
  const description = content
    ? localizedText(content.description ?? "", content.description_translations, locale) || t("defaultDescription")
    : t("defaultDescription");
  const limitedData = failed || !property || !content;

  return (
    <>
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroBackdrop} aria-hidden="true">
          {heroMedia ? (
            <Image src={heroMedia.url} alt="" fill priority sizes="100vw" className={styles.heroRemoteImage} />
          ) : (
            <Image src={LOCAL_HERO} alt="" fill priority sizes="100vw" />
          )}
        </div>
        <div className={styles.heroOverlay} />
        <div className={styles.heroContent}>
          <p className={styles.eyebrow}>{t("eyebrow")}</p>
          <h1 id="hero-title">{title}</h1>
          <p className={styles.lead}>{description}</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#reserva">{t("checkAvailability")}</a>
            <a className={styles.secondaryAction} href="#descobrir">{t("discoverHouse")}</a>
          </div>
        </div>
      </section>

      {limitedData && (
        <p className={styles.dataNotice} role="status">
          {failed ? dataNoticeT("failed") : dataNoticeT("incomplete")}
        </p>
      )}

      <PropertyOverview property={property} content={content} />
      <OutdoorMoment />
      <Rooms />
      <MediaGallery media={media} />
      <BookingFlow
        minimumAdvanceDays={property?.minimum_advance_days}
        bookingHorizonDays={property?.booking_horizon_days}
        maxGuests={property?.max_guests}
        maxInfants={property?.max_infants}
      />
      <Reviews reviews={reviews} />

      <NextStep />

      <ContactForm />
    </>
  );
}

async function NextStep() {
  const t = await getTranslations("NextStep");

  return (
    <section className={styles.nextStep} aria-labelledby="next-step-title">
      <Image src="/images/la-casilla/camps-entorn.webp" alt="" fill sizes="100vw" />
      <div className={styles.nextStepOverlay} />
      <div className={styles.nextStepContent}>
        <p className={styles.eyebrow}>{t("eyebrow")}</p>
        <h2 id="next-step-title">{t("title")}</h2>
        <p>{t("body")}</p>
        <a className={styles.nextStepAction} href="#reserva">{t("cta")}</a>
      </div>
    </section>
  );
}
