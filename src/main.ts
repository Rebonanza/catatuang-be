import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import fastifyHelmet from '@fastify/helmet';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  // Security Headers
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [`'self'`],
        styleSrc: [`'self'`, `'unsafe-inline'`],
        imgSrc: [`'self'`, 'data:', 'validator.swagger.io'],
        scriptSrc: [`'self'`, `https: 'unsafe-inline'`],
      },
    },
  });

  // Shim for Passport compatibility with Fastify
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', (_req, reply, done) => {
      (reply as unknown as Record<string, unknown>).setHeader = (
        name: string,
        value: unknown,
      ) => {
        reply.header(name, value);
      };
      (reply as unknown as Record<string, unknown>).end = () => {
        reply.send();
      };
      done();
    });

  const configService = app.get(ConfigService);
  const corsOrigin = configService.get<string>('CORS_ORIGIN', '*');

  app.enableCors({
    origin: corsOrigin === '*' ? true : corsOrigin.split(','),
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new TransformInterceptor());
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle('CatatUang API')
    .setDescription('Financial management and expense tracking API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/v1/docs', app, document);

  const port = Number(process.env.PORT) || 3000;
  await app.listen(port, '0.0.0.0');
}
bootstrap().catch((err) => {
  console.error('Error during bootstrap', err);
  process.exit(1);
});
